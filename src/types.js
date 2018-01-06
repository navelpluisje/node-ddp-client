// @flow

export type DdpVersion = '1'| 'pre2'| 'pre1';

export type DdpObserver = {
  id: Object,
  name: Object,
  added: Function,
  changed: Function,
  removed: Function,
  stop: Function,
}

export type SocketEvent = {
  code: string,
  reason: string,
  data: string,
  message: string,
}

export type Item = {
  _id: string,
}

export type Options = {
  ssl?: boolean,
  use_ssl?: boolean,
  autoReconnect?: boolean,
  auto_reconnect?: boolean,
  maintain_collections?: boolean,
  maintainCollections?: boolean,
  auto_reconnect_timer?: number,
  autoReconnectTimer?: number,
  ddp_version?: DdpVersion,
  ddpVersion?: DdpVersion,
  host?: string,
  port?: number,
  path?: string,
  url?: string,
  tlsOpts?: Object,
  socketContructor?: Object,
}

export type ConnectMessage = {
  msg: 'connect',
  session: string,
  version: DdpVersion,
  support: Array<string>,
}

export type ConnectedMessage = {
  msg: 'connected',
  session: string,
}

export type FailedMessage = {
  msg: 'failed',
  version: DdpVersion,
}

export type SubMessage = {
  msg: 'sub',
  id: string,
  name: string,
  params: Array<Object>,
}

export type UnsubMessage = {
  msg: 'unsub',
  id: string,
}

export type NosubMessage = {
  msg: 'nosub',
  id: string,
  error?: Error,
}

export type AddedMessage = {
  msg: 'added',
  id: string,
  collection: string,
  fields: Object,
}

export type ChangedMessage = {
  msg: 'changed',
  id: string,
  collection: string,
  fields: Object,
  cleared: Array<string>,
}

export type RemovedMessage = {
  msg: 'removed',
  id: string,
  collection: string,
}

export type ReadyMessage = {
  msg: 'ready',
  subs: Array<string>,
}

export type AddedBeforeMessage = {
  msg: 'addedBefore',
  id: string,
  collection: string,
  fields: Object,
  before: ?string,

}

export type MovedBeforeMessage = {
  msg: 'movedBefore',
  id: string,
  collection: string,
  before: ?string,
}

export type ResultMessage = {
  msg: 'result',
  id: string,
  result: string,
  error: ?string,
}

export type PingMessage = {
  msg: 'ping',
  id: string,
}

export type Message =
  ConnectMessage |
  ConnectedMessage |
  FailedMessage |
  SubMessage |
  UnsubMessage |
  NosubMessage |
  AddedMessage |
  ChangedMessage |
  RemovedMessage |
  ReadyMessage |
  AddedBeforeMessage |
  MovedBeforeMessage |
  ResultMessage |
  PingMessage;
