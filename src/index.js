/* global WebSocket */

// @flow

import EventEmitter from 'events';
import { getValues, getEntries } from './helpers';
import type { Message, DdpVersion, DdpObserver, Item, Options, SocketEvent } from './types';

const MiniMongo = require('minimongo-cache');
const EJSON = require('ejson');

class DDPClient extends EventEmitter {
  host: string;
  port: number;
  path: ?string;
  url: ?string;
  ssl: boolean;
  tlsOpts: Object;
  autoReconnect: boolean;
  autoReconnectTimer: number;
  maintainCollections: boolean;
  ddpVersion: DdpVersion;
  supportedDdpVersions: Array<DdpVersion>;
  SocketConstructor: typeof WebSocket;
  EJSON: EJSON;
  collections: MiniMongo;
  isConnecting: boolean;
  isReconnecting: boolean;
  nextId: number;
  callbacks: {
    [id: string]: Function,
  };
  updatedCallbacks: {
    [id: string]: Function,
  };
  pendingMethods: {
    [id: string]: boolean,
  };
  observers: {
    [name: string]: {
      [id: string]: DdpObserver,
    },
  };
  isClosing: boolean;
  connectionFailed: boolean;
  reconnectTimeout: ?setTimeout;
  socket: Object;
  session: ?string;
  emit: EventEmitter.emit;

  constructor(opts?: Options = {}) {
    super();
    const options: Options = { ...opts };
    // backwards compatibility
    if ('use_ssl' in opts) {
      options.ssl = opts.use_ssl || false;
    }
    if ('auto_reconnect' in opts) {
      options.autoReconnect = opts.auto_reconnect || true;
    }
    if ('auto_reconnect_timer' in opts) {
      options.autoReconnectTimer = opts.auto_reconnect_timer || 500;
    }
    if ('maintain_collections' in opts) {
      options.maintainCollections = opts.maintain_collections || true;
    }
    if ('ddp_version' in opts) {
      options.ddpVersion = opts.ddp_version || '1';
    }

    // default arguments
    this.host = options.host || 'localhost';
    this.port = parseInt(options.port, 10) || 3000;
    this.path = options.path || null;
    this.ssl = options.ssl || this.port === 443;
    this.tlsOpts = options.tlsOpts || {};
    this.autoReconnect = (typeof options.autoReconnect === 'boolean') ? options.autoReconnect : true;
    this.autoReconnectTimer = (typeof options.autoReconnectTimer === 'number') ? options.autoReconnectTimer : 500;
    this.maintainCollections = (typeof options.maintainCollections === 'boolean') ? options.maintainCollections : true;
    this.url = options.url || null;
    this.SocketConstructor = options.socketContructor || WebSocket;

    // support multiple ddp versions
    this.ddpVersion = options.ddpVersion || '1';
    this.supportedDdpVersions = ['1', 'pre2', 'pre1'];

    // Expose EJSON object, so client can use EJSON.addType(...)
    this.EJSON = EJSON || null;

    // very very simple collections (name -> [{id -> document}])
    if (this.maintainCollections) {
      this.collections = new MiniMongo();
    }

    // internal stuff to track callbacks
    this.isConnecting = false;
    this.isReconnecting = false;
    this.nextId = 0;
    this.callbacks = {};
    this.updatedCallbacks = {};
    this.pendingMethods = {};
    this.observers = {};
  }

  prepareHandlers() {
    this.socket.onopen = () => {
      // just go ahead and open the connection on connect
      this.send({
        msg: 'connect',
        version: this.ddpVersion,
        support: this.supportedDdpVersions,
      });
    };

    this.socket.onerror = (error: SocketEvent) => {
      // error received before connection was established
      if (this.isConnecting) {
        this.emit('failed', error.message);
      }

      this.emit('socket-error', error);
    };

    this.socket.onclose = (event: SocketEvent) => {
      this.emit('socket-close', event.code, event.reason);
      this.endPendingMethodCalls();
      this.recoverNetworkError();
    };

    this.socket.onmessage = (event: SocketEvent) => {
      this.message(event.data);
      this.emit('message', event.data);
    };
  }

  clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  recoverNetworkError() {
    if (this.autoReconnect && !this.connectionFailed && !this.isClosing) {
      this.clearReconnectTimeout();
      this.reconnectTimeout = setTimeout(
        () => { this.connect(); },
        this.autoReconnectTimer,
      );
      this.isReconnecting = true;
    }
  }

  // RAW, low level functions
  send(data: Object) {
    this.socket.send(EJSON.stringify(data));
  }

  // handle a message from the server
  message(msgData: string) {
    const data: Message = EJSON.parse(msgData);

    // TODO: 'addedBefore' -- not yet implemented in Meteor
    // TODO: 'movedBefore' -- not yet implemented in Meteor

    switch (data.msg) {
      case 'connected':
        this.session = data.session;
        this.emit('connected');
        break;

      case 'failed':
        if (this.supportedDdpVersions.includes(data.version)) {
          this.ddpVersion = data.version;
          this.connect();
        } else {
          this.autoReconnect = false;
          this.emit('failed', 'Cannot negotiate DDP version');
        }
        break;

      case 'result': {
        const cb = this.callbacks[data.id];

        if (cb) {
          cb(data.error, data.result);
          delete this.callbacks[data.id];
        }
        break;
      }

      case 'nosub': {
        const cb = this.callbacks[data.id];

        if (cb) {
          cb(data.error);
          delete this.callbacks[data.id];
        }
        break;
      }

      case 'added':
        if (this.maintainCollections && data.collection) {
          const name: string = data.collection;
          const { id } = data;
          const item: Item = {
            _id: id,
          };

          if (data.fields) {
            getEntries(data.fields).forEach(([key, value]) => {
              item[key] = value;
            });
          }

          if (!this.collections[name]) {
            this.collections.addCollection(name);
          }

          this.collections[name].upsert(item);

          if (this.observers[name]) {
            getValues(this.observers[name]).forEach((observer: DdpObserver) => {
              observer.added(id, item);
            });
          }
        }
        break;

      case 'removed':
        if (this.maintainCollections && data.collection) {
          const name = data.collection;
          const { id } = data;
          const oldValue = this.collections[name].get(id);

          this.collections[name].remove({ _id: id });

          if (this.observers[name]) {
            getValues(this.observers[name]).forEach((observer: DdpObserver) => {
              observer.removed(id, oldValue);
            });
          }
        }
        break;

      case 'changed':
        if (this.maintainCollections && data.collection) {
          const name = data.collection;
          const { id } = data;
          let oldValue = {};
          let newValue = {};
          const clearedFields = data.cleared || [];
          const item = {
            _id: id,
          };

          if (data.fields) {
            oldValue = this.collections[name].get(id);
            getEntries(data.fields).forEach(([key, value]) => {
              item[key] = value;
            });
          }

          newValue = this.collections[name].upsert(item);

          if (this.observers[name]) {
            (getValues(this.observers[name]): Array<DdpObserver>)
              .forEach((observer: DdpObserver) => {
                observer.changed(id, oldValue, clearedFields, newValue);
              });
          }
        }
        break;

      case 'ready':
        data.subs.forEach((id) => {
          const cb = this.callbacks[id];
          if (cb) {
            cb();
            delete this.callbacks[id];
          }
        });
        break;

      case 'ping':
        this.send(('id' in data) ? { msg: 'pong', id: data.id } : { msg: 'pong' });
        break;
      default:
    }
  }

  getNextId(): string {
    this.nextId += 1;
    return (this.nextId).toString();
  }

  addObserver(observer: DdpObserver) {
    const { id, name } = observer;

    if (!this.observers[name]) {
      this.observers[name] = {};
    }
    this.observers[name][id] = observer;
  }

  removeObserver(observer: DdpObserver) {
    const { id, name } = observer;

    if (!this.observers[name]) { return; }

    delete this.observers[name][id];
  }

  // USER functions -- use these to control the client

  /* open the connection to the server
   *
   *  connected(): Called when the 'connected' message is received
   *               If autoReconnect is true (default), the callback will be
   *               called each time the connection is opened.
   */
  connect(connected?: Function): Promise<*> {
    return new Promise((resolve: Function) => {
      this.isConnecting = true;
      this.connectionFailed = false;
      this.isClosing = false;

      if (connected) {
        this.addConnectedListener(connected);
        this.addFailedListener(connected);
      }

      const url = this.buildWsUrl();
      this.makeWebSocketConnection(url);
      resolve(!this.connectionFailed);
    });
  }

  addConnectedListener(connected: Function) {
    this.addListener('connected', () => {
      this.clearReconnectTimeout();

      connected(undefined, this.isReconnecting);
      this.isConnecting = false;
      this.isReconnecting = false;
    });
  }

  addFailedListener(connected: Function) {
    this.addListener('failed', (error) => {
      this.isConnecting = false;
      this.connectionFailed = true;
      connected(error, this.isReconnecting);
    });
  }

  endPendingMethodCalls() {
    const ids = Object.keys(this.pendingMethods);
    this.pendingMethods = {};

    ids.forEach((id) => {
      if (this.callbacks[id]) {
        this.callbacks[id](new Error('DDPClient: Disconnected from DDP server'));
        delete this.callbacks[id];
      }

      if (this.updatedCallbacks[id]) {
        this.updatedCallbacks[id]();
        delete this.updatedCallbacks[id];
      }
    });
  }

  buildWsUrl(wsPath?: string): string {
    if (this.url) { return this.url; }

    const path = wsPath || this.path || 'websocket';
    const protocol = this.ssl ? 'wss://' : 'ws://';

    let url = `${protocol}${this.host}`;
    url += this.port === 0 ? '' : `:${this.port}`;
    url += (path.indexOf('/') === 0) ? path : `/${path}`;

    return url;
  }

  async makeWebSocketConnection(url: string) {
    this.socket = await new this.SocketConstructor(url);
    this.prepareHandlers();
  }

  close() {
    this.isClosing = true;
    this.socket.close();
    this.removeAllListeners('connected');
    this.removeAllListeners('failed');
  }

  // call a method on the server,
  //
  // callback = function(err, result)
  call(method: string, params: ?Array<Object>, callback?: Function, updatedCallback?: Function) {
    const id: string = this.getNextId();

    this.callbacks[id] = () => {
      delete this.pendingMethods[id];

      if (callback) {
        callback.apply(this, arguments); // eslint-disable-line
      }
    };

    this.updatedCallbacks[id] = () => {
      delete this.pendingMethods[id];

      if (updatedCallback) {
        updatedCallback.apply(this, arguments); // eslint-disable-line
      }
    };

    this.pendingMethods[id] = true;

    this.send({
      msg: 'method',
      id,
      method,
      params,
    });
  }


  callWithRandomSeed(
    method: string,
    params: ?Array<Object>,
    randomSeed?: JSON,
    callback?: Function,
    updatedCallback?: Function,
  ) {
    const id: string = this.getNextId();

    if (callback) {
      this.callbacks[id] = callback;
    }

    if (updatedCallback) {
      this.updatedCallbacks[id] = updatedCallback;
    }

    this.send({
      msg: 'method',
      id,
      method,
      randomSeed,
      params,
    });
  }

  // open a subscription on the server, callback should handle on ready and nosub
  subscribe(name: string, params: ?Array<Object>, callback: Function) {
    const id: string = this.getNextId();

    if (callback) {
      this.callbacks[id] = callback;
    }

    this.send({
      msg: 'sub',
      id,
      name,
      params,
    });

    return id;
  }

  unsubscribe(id: string) {
    this.send({
      msg: 'unsub',
      id,
    });
  }

  /**
   * Adds an observer to a collection and returns the observer.
   * Observation can be stopped by calling the stop() method on the observer.
   * Functions for added, updated and removed can be added to the observer
   * afterward.
   */
  observe(name: string, added: Function, changed: Function, removed: Function) {
    const id: string = this.getNextId();
    const observer: DdpObserver = {
      id,
      name,
      added,
      changed,
      removed,
      stop: () => {
        this.removeObserver(observer);
      },
    };

    // // name, _id are immutable
    // Object.defineProperty(
    //   observer,
    //   'name',
    //   ({
    //     get: () => name,
    //     enumerable: true,
    //   }: Object),
    // );

    // Object.defineProperty(
    //   observer,
    //   'id',
    //   ({
    //     get: () => id,
    //   }: Object),
    // );

    // observer.stop = () => {
    //   this.removeObserver(observer);
    // };

    this.addObserver(observer);

    return observer;
  }
}

export default DDPClient;
