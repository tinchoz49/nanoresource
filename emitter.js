// Copy of index.js that extends from EventEmitter

const events = require('events')
const inherits = require('inherits')

const opening = Symbol('opening queue')
const preclosing = Symbol('closing when inactive')
const closing = Symbol('closing queue')
const sync = Symbol('sync')
const fastClose = Symbol('fast close')

module.exports = Nanoresource

function Nanoresource (opts) {
  if (!(this instanceof Nanoresource)) return new Nanoresource(opts)
  events.EventEmitter.call(this)

  if (!opts) opts = {}
  if (opts.open) this._open = opts.open
  if (opts.close) this._close = opts.close

  this.opening = false
  this.opened = false
  this.closing = false
  this.closed = false
  this.actives = 0

  this[opening] = null
  this[preclosing] = null
  this[closing] = null
  this[sync] = false
  this[fastClose] = true
}

inherits(Nanoresource, events.EventEmitter)

Nanoresource.prototype._open = function (cb) {
  cb(null)
}

Nanoresource.prototype._close = function (cb) {
  cb(null)
}

Nanoresource.prototype.open = function (cb) {
  if (!cb) cb = noop

  if (this[closing] || this.closed) return process.nextTick(cb, new Error('Resource is closed'))
  if (this.opened) return process.nextTick(cb)

  if (this[opening]) {
    this[opening].push(cb)
    return
  }

  this.opening = true
  this[opening] = [cb]
  this[sync] = true
  this._open(onopen.bind(this))
  this[sync] = false
}

Nanoresource.prototype.active = function (cb) {
  if ((this[fastClose] && this[preclosing]) || this[closing] || this.closed) {
    if (cb) process.nextTick(cb, new Error('Resource is closed'))
    return false
  }
  this.actives++
  return true
}

Nanoresource.prototype.inactive = function (cb, err, val) {
  if (!--this.actives) {
    const queue = this[preclosing]
    if (queue) {
      this[preclosing] = null
      while (queue.length) this.close(queue.shift())
    }
  }

  if (cb) cb(err, val)
}

Nanoresource.prototype.close = function (allowActive, cb) {
  if (typeof allowActive === 'function') return this.close(false, allowActive)
  if (!cb) cb = noop

  if (allowActive) this[fastClose] = false

  if (this.closed) return process.nextTick(cb)

  if (this.actives || this[opening]) {
    if (!this[preclosing]) this[preclosing] = []
    this[preclosing].push(cb)
    return
  }

  if (!this.opened) {
    this.closed = true
    process.nextTick(cb)
    return
  }

  if (this[closing]) {
    this[closing].push(cb)
    return
  }

  this.closing = true
  this[closing] = [cb]
  this[sync] = true
  this._close(onclose.bind(this))
  this[sync] = false
}

function onopen (err) {
  if (this[sync]) return process.nextTick(onopen.bind(this), err)

  const oqueue = this[opening]
  this[opening] = null
  this.opening = false
  this.opened = !err

  while (oqueue.length) oqueue.shift()(err)

  const cqueue = this[preclosing]
  if (cqueue && !this.actives) {
    this[preclosing] = null
    while (cqueue.length) this.close(cqueue.shift())
  }
}

function onclose (err) {
  if (this[sync]) return process.nextTick(onclose.bind(this), err)
  const queue = this[closing]
  this.closing = false
  this[closing] = null
  this.closed = !err
  while (queue.length) queue.shift()(err)
}

function noop () {}
