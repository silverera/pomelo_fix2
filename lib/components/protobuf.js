var fs = require('fs');
var path = require('path');
var protobuf = require('pomelo-protobuf');
var Constants = require('../util/constants');
var logger = require('pomelo-logger').getLogger('pomelo', __filename);

module.exports = function(app, opts) {
    return new Component(app, opts);
};

var Component = function(app, opts) {
    this.app = app;
    opts = opts || {};
    this.watchers = {};
    this.serverProtos = {};
    this.clientProtos = {};
    this.version = 0;

    var env = app.get(Constants.RESERVED.ENV);
    var originServerPath = path.join(app.getBase(), Constants.FILEPATH.SERVER_PROTOS);
    var presentServerPath = path.join(Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.SERVER_PROTOS));
    var originClientPath = path.join(app.getBase(), Constants.FILEPATH.CLIENT_PROTOS);
    var presentClientPath = path.join(Constants.FILEPATH.CONFIG_DIR, env, path.basename(Constants.FILEPATH.CLIENT_PROTOS));

    this.serverProtosPath = opts.serverProtos || (fs.existsSync(originClientPath) ? Constants.FILEPATH.SERVER_PROTOS : presentServerPath);
    this.clientProtosPath = opts.clientProtos || (fs.existsSync(originServerPath) ? Constants.FILEPATH.CLIENT_PROTOS : presentClientPath);

    this.setProtos(Constants.RESERVED.SERVER, path.join(app.getBase(), this.serverProtosPath));
    this.setProtos(Constants.RESERVED.CLIENT, path.join(app.getBase(), this.clientProtosPath));

    protobuf.init({encoderProtos:this.serverProtos, decoderProtos:this.clientProtos});
};

var pro = Component.prototype;

pro.name = '__protobuf__';

pro.encode = function(key, msg) {
    return protobuf.encode(key, msg);
};

pro.encode2Bytes = function(key, msg) {
    return protobuf.encode2Bytes(key, msg);
};

pro.decode = function(key, msg) {
    return protobuf.decode(key, msg);
};

pro.getProtos = function() {
    return {
        server : this.serverProtos,
        client : this.clientProtos,
        version : this.version
    };
};

pro.getVersion = function() {
    return this.version;
};

pro.setProtos = function(type, path) {
    if(!fs.existsSync(path)) {
        return;
    }

    if(type === Constants.RESERVED.SERVER) {
        this.serverProtos = protobuf.parse(require(path));
    }

    if(type === Constants.RESERVED.CLIENT) {
        this.clientProtos = protobuf.parse(require(path));
    }

    //Set version to modify time
    var time = fs.statSync(path).mtime.getTime();
    if(this.version < time) {
        this.version = time;
    }

    //Watch file
    var watcher = fs.watch(path, this.onUpdate.bind(this, type, path));
    if (this.watchers[type]) {
        this.watchers[type].close();
    }
    this.watchers[type] = watcher;
};


var Parser = module.exports;

/**
 * [parse the original protos, give the paresed result can be used by protobuf encode/decode.]
 * @param  {[Object]} protos Original protos, in a js map.
 * @return {[Object]} The presed result, a js object represent all the meta data of the given protos.
 */
function parse(protos){
    var maps = {};
    for(var key in protos){
        var param1 = key.split('.');
        var params = key.split(' ');
        if(param1.length !=3 && params.length != 2){
            var msg =  protos[key];
            var keyCount = 0;
            for(var name in msg){
                keyCount += 1;
            }
            msg["optional uInt32 msgID"] = keyCount+1;

        }
        maps[key] = parseObject(protos[key]);
    }
    return maps;
};

/**
 * [parse a single protos, return a object represent the result. The method can be invocked recursively.]
 * @param  {[Object]} obj The origin proto need to parse.
 * @return {[Object]} The parsed result, a js object.
 */
function parseObject(obj){
    var proto = {};
    var nestProtos = {};
    var tags = {};

    for(var name in obj){
        var tag = obj[name];
        var params = name.split(' ');

        switch(params[0]){
            case 'message':
                if(params.length !== 2){
                    continue;
                }
                nestProtos[params[1]] = parseObject(tag);
                continue;
            case 'required':
            case 'optional':
            case 'repeated':{
                //params length should be 3 and tag can't be duplicated
                if(params.length !== 3 || !!tags[tag]){
                    continue;
                }
                proto[params[2]] = {
                    option : params[0],
                    type : params[1],
                    tag : tag
                };
                tags[tag] = params[2];
            }
        }
    }

    proto.__messages = nestProtos;
    proto.__tags = tags;
    return proto;
}

pro.onUpdate = function(type, path, event) {
    if(event !== 'change') {
        return;
    }

    fs.readFile(path, 'utf8' ,function(err, data) {
        try {
            //var protos = protobuf.parse(JSON.parse(data));
            var protos = parse(JSON.parse(data));
            if(type === Constants.RESERVED.SERVER) {
                protobuf.setEncoderProtos(protos);
            } else {
                protobuf.setDecoderProtos(protos);
            }

            this.version = fs.statSync(path).mtime.getTime();
            logger.debug('change proto file , type : %j, path : %j, version : %j', type, path, this.version);
        } catch(e) {
            logger.warn("change proto file error! path : %j", path);
            logger.warn(e);
        }
    });
};

pro.stop = function(force, cb) {
    for (var type in this.watchers) {
        this.watchers[type].close();
    }
    this.watchers = {};
    process.nextTick(cb);
};
