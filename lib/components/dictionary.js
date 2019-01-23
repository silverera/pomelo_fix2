var fs = require('fs');
var path = require('path');
var utils = require('../util/utils');
var Loader = require('pomelo-loader');
var pathUtil = require('../util/pathUtil');
var crypto = require('crypto');

module.exports = function (app, opts) {
    return new Component(app, opts);
};

var Component = function (app, opts) {
    this.app = app;
    this.dict = {};
    this.abbrs = {};
    this.userDicPath = null;
    this.version = "";

    //Set user dictionary
    var p = path.join(app.getBase(), '/config/dictionary.json');
    if (!!opts && !!opts.dict) {
        p = opts.dict;
    }
    if (fs.existsSync(p)) {
        this.userDicPath = p;
    }
};

var pro = Component.prototype;

pro.name = '__dictionary__';

pro.start = function (cb) {
    var servers = pathUtil.listUserRemoteDir(this.app.getBase());
    var routes = [];

    //Load all the handler files
    for (var i in servers) {
        var serverType = servers[i];
        var p = pathUtil.getHandlerPath(this.app.getBase(), serverType);
        if (!p) {
            continue;
        }

        var handlers = Loader.load(p, this.app);

        for (var name in handlers) {
            var handler = handlers[name];
            var ignore = [];
            if (handler.__proto__.__meta) {
                ignore = handler.__proto__.__meta.ignore
            }
            for (var key in handler) {
                if (typeof(handler[key]) === 'function' && ignore.indexOf(key) < 0) {
                    //if (!handler.hasOwnProperty(key)) {
                    //    continue;
                    //}
                    if (key === "_dyInit" || key == "_dyInvoke" || key == "_getBean") {
                        continue;
                    }
                    routes.push(serverType + '.' + name + '.' + key);
                }
            }
        }
    }

    // check if client proto matches the server handlers.
    var old = routes;
    routes.sort();
    routes = Object.keys(require(path.join(this.app.getBase(), '/config/clientProtos.json')));
    routes.sort();
    if (old.length != routes.length || old > routes || old < routes) {
        console.error('handlers in script   :%d,%s', old.length, JSON.stringify(old));
        console.error('handlers json proto  :%d,%s', routes.length, JSON.stringify(routes));
    }
    routes = old;

    //Sort the route to make sure all the routers abbr are the same in all the servers
    routes.sort();
    var abbr;
    var i;
    for (i = 0; i < routes.length; i++) {
        abbr = i + 1;
        this.abbrs[abbr] = routes[i];
        this.dict[routes[i]] = abbr;
    }

    //Load user dictionary
    if (!!this.userDicPath) {
        var userDic = require(this.userDicPath);

        abbr = routes.length + 1;
        for (i = 0; i < userDic.length; i++) {
            var route = userDic[i];

            this.abbrs[abbr] = route;
            this.dict[route] = abbr;
            abbr++;
        }
    }

    this.version = crypto.createHash('md5').update(JSON.stringify(this.dict)).digest('base64');

    utils.invokeCallback(cb);
};

pro.getDict = function () {
    return this.dict;
};

pro.getAbbrs = function () {
    return this.abbrs;
};

pro.getVersion = function () {
    return this.version;
};
