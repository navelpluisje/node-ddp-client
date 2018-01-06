(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('events')) :
	typeof define === 'function' && define.amd ? define(['events'], factory) :
	(global.DDPClient = factory(global.EventEmitter));
}(this, (function (EventEmitter) { 'use strict';

EventEmitter = EventEmitter && EventEmitter.hasOwnProperty('default') ? EventEmitter['default'] : EventEmitter;

/* global $Values */

//      

function getValues(values) {
  return Object.values(values);
}

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();







var _extends = Object.assign || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];

    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }

  return target;
};



var inherits = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
};











var possibleConstructorReturn = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && (typeof call === "object" || typeof call === "function") ? call : self;
};





var slicedToArray = function () {
  function sliceIterator(arr, i) {
    var _arr = [];
    var _n = true;
    var _d = false;
    var _e = undefined;

    try {
      for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
        _arr.push(_s.value);

        if (i && _arr.length === i) break;
      }
    } catch (err) {
      _d = true;
      _e = err;
    } finally {
      try {
        if (!_n && _i["return"]) _i["return"]();
      } finally {
        if (_d) throw _e;
      }
    }

    return _arr;
  }

  return function (arr, i) {
    if (Array.isArray(arr)) {
      return arr;
    } else if (Symbol.iterator in Object(arr)) {
      return sliceIterator(arr, i);
    } else {
      throw new TypeError("Invalid attempt to destructure non-iterable instance");
    }
  };
}();

/* global WebSocket */

//      

var MiniMongo = require('minimongo-cache');
var EJSON = require('ejson');

var initialObserver = {
  id: {},
  name: {},
  added: function added() {},
  changed: function changed() {},
  removed: function removed() {},
  stop: function stop() {}
};

var DDPClient = function (_EventEmitter) {
  inherits(DDPClient, _EventEmitter);

  function DDPClient() {
    var opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    classCallCheck(this, DDPClient);

    var _this = possibleConstructorReturn(this, (DDPClient.__proto__ || Object.getPrototypeOf(DDPClient)).call(this));

    var options = _extends({}, opts);
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
    _this.host = options.host || 'localhost';
    _this.port = options.port || 3000;
    _this.path = options.path || null;
    _this.ssl = options.ssl || _this.port === 443;
    _this.tlsOpts = options.tlsOpts || {};
    _this.autoReconnect = typeof options.autoReconnect === 'boolean' ? options.autoReconnect : true;
    _this.autoReconnectTimer = typeof options.autoReconnectTimer === 'number' ? options.autoReconnectTimer : 500;
    _this.maintainCollections = typeof options.maintainCollections === 'boolean' ? options.maintainCollections : true;
    _this.url = options.url || null;
    _this.SocketConstructor = options.socketContructor || WebSocket;

    // support multiple ddp versions
    _this.ddpVersion = options.ddpVersion || '1';
    _this.supportedDdpVersions = ['1', 'pre2', 'pre1'];

    // Expose EJSON object, so client can use EJSON.addType(...)
    _this.EJSON = EJSON || null;

    // very very simple collections (name -> [{id -> document}])
    if (_this.maintainCollections) {
      _this.collections = new MiniMongo();
    }

    // internal stuff to track callbacks
    _this.isConnecting = false;
    _this.isReconnecting = false;
    _this.nextId = 0;
    _this.callbacks = {};
    _this.updatedCallbacks = {};
    _this.pendingMethods = {};
    _this.observers = {};
    return _this;
  }

  createClass(DDPClient, [{
    key: 'prepareHandlers',
    value: function prepareHandlers() {
      var _this2 = this;

      this.socket.onopen = function () {
        // just go ahead and open the connection on connect
        _this2.send({
          msg: 'connect',
          version: _this2.ddpVersion,
          support: _this2.supportedDdpVersions
        });
      };

      this.socket.onerror = function (error) {
        // error received before connection was established
        if (_this2.isConnecting) {
          _this2.emit('failed', error.message);
        }

        _this2.emit('socket-error', error);
      };

      this.socket.onclose = function (event) {
        _this2.emit('socket-close', event.code, event.reason);
        _this2.endPendingMethodCalls();
        _this2.recoverNetworkError();
      };

      this.socket.onmessage = function (event) {
        _this2.message(event.data);
        _this2.emit('message', event.data);
      };
    }
  }, {
    key: 'clearReconnectTimeout',
    value: function clearReconnectTimeout() {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    }
  }, {
    key: 'recoverNetworkError',
    value: function recoverNetworkError() {
      var _this3 = this;

      if (this.autoReconnect && !this.connectionFailed && !this.isClosing) {
        this.clearReconnectTimeout();
        this.reconnectTimeout = setTimeout(function () {
          _this3.connect();
        }, this.autoReconnectTimer);
        this.isReconnecting = true;
      }
    }

    // RAW, low level functions

  }, {
    key: 'send',
    value: function send(data) {
      this.socket.send(EJSON.stringify(data));
    }

    // handle a message from the server

  }, {
    key: 'message',
    value: function message(msgData) {
      var _this4 = this;

      var data = EJSON.parse(msgData);

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

        case 'result':
          {
            var cb = this.callbacks[data.id];

            if (cb) {
              cb(data.error, data.result);
              delete this.callbacks[data.id];
            }
            break;
          }

        case 'nosub':
          {
            var _cb = this.callbacks[data.id];

            if (_cb) {
              _cb(data.error);
              delete this.callbacks[data.id];
            }
            break;
          }

        case 'added':
          if (this.maintainCollections && data.collection) {
            var name = data.collection;
            var id = data.id;

            var item = {
              _id: id
            };

            if (data.fields) {
              getValues(data.fields).forEach(function (_ref) {
                var _ref2 = slicedToArray(_ref, 2),
                    key = _ref2[0],
                    value = _ref2[1];

                item[key] = value;
              });
            }

            if (!this.collections[name]) {
              this.collections.addCollection(name);
            }

            this.collections[name].upsert(item);

            if (this.observers[name]) {
              getValues(this.observers[name]).forEach(function (observer) {
                observer.added(id, item);
              });
            }
          }
          break;

        case 'removed':
          if (this.maintainCollections && data.collection) {
            var _name = data.collection;
            var _id = data.id;

            var oldValue = this.collections[_name].get(_id);

            this.collections[_name].remove({ _id: _id });

            if (this.observers[_name]) {
              getValues(this.observers[_name]).forEach(function (observer) {
                observer.removed(_id, oldValue);
              });
            }
          }
          break;

        case 'changed':
          if (this.maintainCollections && data.collection) {
            var _name2 = data.collection;
            var _id2 = data.id;

            var _oldValue = {};
            var newValue = {};
            var clearedFields = data.cleared || [];
            var _item = {
              _id: _id2
            };

            if (data.fields) {
              _oldValue = this.collections[_name2].get(_id2);
              Object.entries(data.fields).forEach(function (_ref3) {
                var _ref4 = slicedToArray(_ref3, 2),
                    key = _ref4[0],
                    value = _ref4[1];

                _item[key] = value;
              });
            }

            newValue = this.collections[_name2].upsert(_item);

            if (this.observers[_name2]) {
              getValues(this.observers[_name2]).forEach(function (observer) {
                observer.changed(_id2, _oldValue, clearedFields, newValue);
              });
            }
          }
          break;

        case 'ready':
          data.subs.forEach(function (id) {
            var cb = _this4.callbacks[id];
            if (cb) {
              cb();
              delete _this4.callbacks[id];
            }
          });
          break;

        case 'ping':
          this.send('id' in data ? { msg: 'pong', id: data.id } : { msg: 'pong' });
          break;
        default:
      }
    }
  }, {
    key: 'getNextId',
    value: function getNextId() {
      this.nextId += 1;
      return this.nextId.toString();
    }
  }, {
    key: 'addObserver',
    value: function addObserver(observer) {
      var id = observer.id.get();
      var name = observer.name.get();

      if (!this.observers[name]) {
        this.observers[name] = initialObserver;
      }
      this.observers[name][id] = observer;
    }
  }, {
    key: 'removeObserver',
    value: function removeObserver(observer) {
      var id = observer.id.get();
      var name = observer.name.get();

      if (!this.observers[name]) {
        return;
      }

      delete this.observers[name][id];
    }

    // USER functions -- use these to control the client

    /* open the connection to the server
     *
     *  connected(): Called when the 'connected' message is received
     *               If autoReconnect is true (default), the callback will be
     *               called each time the connection is opened.
     */

  }, {
    key: 'connect',
    value: function connect(connected) {
      this.isConnecting = true;
      this.connectionFailed = false;
      this.isClosing = false;

      if (connected) {
        this.addConnectedListener(connected);
        this.addFailedListener(connected);
      }

      var url = this.buildWsUrl();
      this.makeWebSocketConnection(url);
    }
  }, {
    key: 'addConnectedListener',
    value: function addConnectedListener(connected) {
      var _this5 = this;

      this.addListener('connected', function () {
        _this5.clearReconnectTimeout();

        connected(undefined, _this5.isReconnecting);
        _this5.isConnecting = false;
        _this5.isReconnecting = false;
      });
    }
  }, {
    key: 'addFailedListener',
    value: function addFailedListener(connected) {
      var _this6 = this;

      this.addListener('failed', function (error) {
        _this6.isConnecting = false;
        _this6.connectionFailed = true;
        connected(error, _this6.isReconnecting);
      });
    }
  }, {
    key: 'endPendingMethodCalls',
    value: function endPendingMethodCalls() {
      var _this7 = this;

      var ids = Object.keys(this.pendingMethods);
      this.pendingMethods = {};

      ids.forEach(function (id) {
        if (_this7.callbacks[id]) {
          _this7.callbacks[id](new Error('DDPClient: Disconnected from DDP server'));
          delete _this7.callbacks[id];
        }

        if (_this7.updatedCallbacks[id]) {
          _this7.updatedCallbacks[id]();
          delete _this7.updatedCallbacks[id];
        }
      });
    }
  }, {
    key: 'buildWsUrl',
    value: function buildWsUrl(wsPath) {
      if (this.url) {
        return this.url;
      }

      var path = wsPath || this.path || 'websocket';
      var protocol = this.ssl ? 'wss://' : 'ws://';

      var url = '' + protocol + this.host;
      url += this.port === 0 ? '' : ':' + this.port;
      url += path.indexOf('/') === 0 ? path : '/' + path;

      return url;
    }
  }, {
    key: 'makeWebSocketConnection',
    value: function makeWebSocketConnection(url) {
      this.socket = new this.SocketConstructor(url);
      this.prepareHandlers();
    }
  }, {
    key: 'close',
    value: function close() {
      this.isClosing = true;
      this.socket.close();
      this.removeAllListeners('connected');
      this.removeAllListeners('failed');
    }

    // call a method on the server,
    //
    // callback = function(err, result)

  }, {
    key: 'call',
    value: function call(method, params, callback, updatedCallback) {
      var _this8 = this,
          _arguments = arguments;

      var id = this.getNextId();

      this.callbacks[id] = function () {
        delete _this8.pendingMethods[id];

        if (callback) {
          callback.apply(_this8, _arguments); // eslint-disable-line
        }
      };

      this.updatedCallbacks[id] = function () {
        delete _this8.pendingMethods[id];

        if (updatedCallback) {
          updatedCallback.apply(_this8, _arguments); // eslint-disable-line
        }
      };

      this.pendingMethods[id] = true;

      this.send({
        msg: 'method',
        id: id,
        method: method,
        params: params
      });
    }
  }, {
    key: 'callWithRandomSeed',
    value: function callWithRandomSeed(method, params, randomSeed, callback, updatedCallback) {
      var id = this.getNextId();

      if (callback) {
        this.callbacks[id] = callback;
      }

      if (updatedCallback) {
        this.updatedCallbacks[id] = updatedCallback;
      }

      this.send({
        msg: 'method',
        id: id,
        method: method,
        randomSeed: randomSeed,
        params: params
      });
    }

    // open a subscription on the server, callback should handle on ready and nosub

  }, {
    key: 'subscribe',
    value: function subscribe(name, params, callback) {
      var id = this.getNextId();

      if (callback) {
        this.callbacks[id] = callback;
      }

      this.send({
        msg: 'sub',
        id: id,
        name: name,
        params: params
      });

      return id;
    }
  }, {
    key: 'unsubscribe',
    value: function unsubscribe(id) {
      this.send({
        msg: 'unsub',
        id: id
      });
    }

    /**
     * Adds an observer to a collection and returns the observer.
     * Observation can be stopped by calling the stop() method on the observer.
     * Functions for added, updated and removed can be added to the observer
     * afterward.
     */

  }, {
    key: 'observe',
    value: function observe(name, added, changed, removed) {
      var _this9 = this;

      var id = this.getNextId();
      var observer = _extends({}, initialObserver, {
        added: added,
        changed: changed,
        removed: removed
      });

      // name, _id are immutable
      Object.defineProperty(observer, 'name', {
        get: function get$$1() {
          return name;
        },
        enumerable: true
      });

      Object.defineProperty(observer, 'id', {
        get: function get$$1() {
          return id;
        }
      });

      observer.stop = function () {
        _this9.removeObserver(observer);
      };

      this.addObserver(observer);

      return observer;
    }
  }]);
  return DDPClient;
}(EventEmitter);

return DDPClient;

})));
