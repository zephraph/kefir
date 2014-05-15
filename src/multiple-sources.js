// TODO
//
// observable.flatMapLatest(f)
// observable.flatMapFirst(f)
//
// observable.zip(other, f)
//
// observable.awaiting(otherObservable)
//
// stream.concat(otherStream)
//
// Kefir.onValues(a, b [, c...], f)




// var PluggableMixin = {

//   __Constructor: function(){
//     this.__plugged = [];
//   },
//   __handlePlugged: function(i, value){
//     this._send(value);
//   },
//   __end: function(){
//     this.__plugged = null;
//   }


// }





// Bus

Kefir.Bus = function Bus(){
  Stream.call(this);
  this.__plugged = [];
}

inherit(Kefir.Bus, Stream, {

  __ClassName: 'Bus',
  __objName: 'Kefir.bus()',
  push: function(x){
    this._send(x)
  },
  plug: function(stream){
    if (!this.isEnded()) {
      this.__plugged.push(stream);
      if (this.hasSubscribers()) {
        stream.on(this._send, this);
      }
      stream.onEnd(this.unplug, this, stream);
    }
  },
  unplug: function(stream){
    if (!this.isEnded()) {
      stream.off(this._send, this);
      removeFromArray(this.__plugged, stream);
    }
  },
  end: function(){
    this._send(Kefir.END);
  },
  __onFirstIn: function(){
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].on(this._send, this);
    }
  },
  __onLastOut: function(){
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].off(this._send, this);
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__plugged = null;
    this.push = noop;
  }

});

Kefir.bus = function(){
  return new Kefir.Bus;
}





// FlatMap

Kefir.FlatMappedStream = function FlatMappedStream(sourceStream, mapFn){
  Stream.call(this)
  this.__sourceStream = sourceStream;
  this.__plugged = [];
  this.__mapFn = mapFn;
  sourceStream.onEnd(this.__sendEnd, this);
}

inherit(Kefir.FlatMappedStream, Stream, {

  __ClassName: 'FlatMappedStream',
  __objName: 'observable.flatMap(fn)',
  __plugResult: function(x){
    this.__plug(  this.__mapFn(x)  );
  },
  __onFirstIn: function(){
    this.__sourceStream.on(this.__plugResult, this);
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].on(this._send, this);
    }
  },
  __onLastOut: function(){
    this.__sourceStream.off(this.__plugResult, this);
    for (var i = 0; i < this.__plugged.length; i++) {
      this.__plugged[i].off(this._send, this);
    }
  },
  __plug: function(stream){
    this.__plugged.push(stream);
    if (this.hasSubscribers()) {
      stream.on(this._send, this);
    }
    stream.onEnd(this.__unplug, this, stream);
  },
  __unplug: function(stream){
    if (!this.isEnded()) {
      stream.off(this._send, this);
      removeFromArray(this.__plugged, stream);
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__sourceStream = null;
    this.__mapFn = null;
    this.__plugged = null;
  }

})

Observable.prototype.flatMap = function(fn) {
  return new Kefir.FlatMappedStream(this, fn);
};








// Merge

Kefir.MergedStream = function MergedStream(){
  Stream.call(this)
  this.__sources = firstArrOrToArr(arguments);
  for (var i = 0; i < this.__sources.length; i++) {
    this.__sources[i].onEnd(this.__unplug, this, this.__sources[i]);
  }
}

inherit(Kefir.MergedStream, Stream, {

  __ClassName: 'MergedStream',
  __objName: 'Kefir.merge(streams)',
  __onFirstIn: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      this.__sources[i].onChanges(this._send, this);
    }
  },
  __onLastOut: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      this.__sources[i].off(this._send, this);
    }
  },
  __unplug: function(stream){
    stream.off(this._send, this);
    removeFromArray(this.__sources, stream);
    if (this.__sources.length === 0) {
      this._send(Kefir.END);
    }
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__sources = null;
  }

});

Kefir.merge = function() {
  return new Kefir.MergedStream(firstArrOrToArr(arguments));
}

Stream.prototype.merge = function() {
  return Kefir.merge([this].concat(firstArrOrToArr(arguments)));
}









// Combine

Kefir.CombinedStream = function CombinedStream(sources, mapFn){
  Stream.call(this)

  this.__sources = sources;
  this.__cachedValues = new Array(sources.length);
  this.__hasCached = new Array(sources.length);
  this.__mapFn = mapFn;

  for (var i = 0; i < this.__sources.length; i++) {
    this.__sources[i].onEnd(this.__unplug, this, i);
  }

}

inherit(Kefir.CombinedStream, Stream, {

  __ClassName: 'CombinedStream',
  __objName: 'Kefir.combine(streams, fn)',
  __onFirstIn: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      if (this.__sources[i]) {
        this.__sources[i].on(this.__receive, this, i);
      }
    }
  },
  __onLastOut: function(){
    for (var i = 0; i < this.__sources.length; i++) {
      if (this.__sources[i]) {
        this.__sources[i].off(this.__receive, this, i);
      }
    }
  },
  __unplug: function(i){
    this.__sources[i].off(this.__receive, this, i);
    this.__sources[i] = null
    if (isAllDead(this.__sources)) {
      this._send(Kefir.END);
    }
  },
  __receive: function(i, x) {
    this.__hasCached[i] = true;
    this.__cachedValues[i] = x;
    if (this.__allCached()) {
      if (isFn(this.__mapFn)) {
        this._send(this.__mapFn.apply(null, this.__cachedValues));
      } else {
        this._send(this.__cachedValues.slice(0));
      }
    }
  },
  __allCached: function(){
    for (var i = 0; i < this.__hasCached.length; i++) {
      if (!this.__hasCached[i]) {
        return false;
      }
    }
    return true;
  },
  __end: function(){
    Stream.prototype.__end.call(this);
    this.__sources = null;
    this.__cachedValues = null;
    this.__hasCached = null;
    this.__mapFn = null;
  }

});

Kefir.combine = function(sources, mapFn) {
  return new Kefir.CombinedStream(sources, mapFn);
}

Observable.prototype.combine = function(sources, mapFn) {
  return Kefir.combine([this].concat(sources), mapFn);
}