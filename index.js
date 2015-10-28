"use strict";

var fs = require("fs"),
    path = require("path"),
    url = require("url");

var _ = require("underscore"),
    async = require("async"),
    carto = require("carto"),
    yaml = require("js-yaml");

// lazy-load when initialized (to share a common tilelive)
var tilelive;

var defaults = {
  name:'',
  description:'',
  attribution:'',
  source:'',
  styles:{},
  mtime: Date.now(),
  center:[0,0,3],
  bounds:[-180,-85.0511,180,85.0511],
  minzoom:0,
  maxzoom:22,
  scale:1,
  format:'png8:m=h',
  template:'',
  interactivity_layer:'',
  _properties: {},
  _prefs: {
    saveCenter: true
  }
};

var tm = {};

// Named projections.
tm.srs = {
  'WGS84': '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
  '900913': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0.0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over'
};

var style = function(uri, callback) {
  uri = url.parse(uri || "");
  uri.query = uri.query || {};

  var fname = this.filename = path.join(uri.hostname + uri.pathname, "project.yml");

  return this.info(function(err, data) {
    if (err) {
      return callback(err);
    }

    // override properties if necessary
    data.scale = +uri.query.scale || data.scale;

    return style.toXML(data, function(err, xml) {
      if (err) {
        return callback(err);
      }

      var opts = {
        protocol: "vector:",
        xml: xml,
        base: path.dirname(fname),
        scale: data.scale
      };

      return tilelive.load(opts, callback);
    });
  });
};


style.prototype.info = function(callback) {
  var fname = this.filename;

  return fs.readFile(fname, "utf8", function(err, data) {
    if (err) {
      return callback(err);
    }

    try {
      data = yaml.load(data);
    } catch (e) {
      return callback(e);
    }

    return async.map(data.styles, function(filename, next) {
      return fs.readFile(path.join(path.dirname(fname), filename), "utf8", function(err, mss) {
        return next(err, [filename, mss]);
      });
    }, function(err, styles) {
      if (err) {
        return callback(err);
      }

      data.styles = {};

      styles.forEach(function(x) {
        data.styles[x[0]] = x[1];
      });

      Object.keys(defaults).forEach(function(k) {
        data[k] = data[k] || defaults[k];
      });

      return callback(null, data);
    });
  });
};

// Render data to XML.
style.toXML = function(data, callback) {
  return tilelive.load(data.source, function(err, backend) {
    if (err) return callback(err);

    return backend.getInfo(function(err, info) {
      if (err) return callback(err);

      backend.data = info;

      // Include params to be written to XML.
      var opts = [
        'name',
        'description',
        'attribution',
        'bounds',
        'center',
        'format',
        'minzoom',
        'maxzoom',
        'scale',
        'source',
        'template',
        'interactivity_layer',
        'legend'
      ].reduce(function(memo, key) {
        if (key in data) {
          switch(key) {
          // @TODO this is backwards because carto currently only allows the
          // TM1 abstrated representation of these params. Add support in
          // carto for "literal" definition of these fields.
          case 'interactivity_layer':
            if (!backend.data) break;
            if (!backend.data.vector_layers) break;
            var fields = data.template.match(/{{([a-z0-9\-_]+)}}/ig);
            if (!fields) break;
            memo['interactivity'] = {
                layer: data[key],
                fields: fields.map(function(t) { return t.replace(/[{}]+/g,''); })
            };
            break;
          default:
            memo[key] = data[key];
            break;
          }
        }
        return memo;
      }, {});

      // Set projection for Mapnik.
      opts.srs = tm.srs['900913'];

      // Convert datatiles sources to mml layers.
      opts.Layer = _(backend.data.vector_layers).map(function(layer) {
        return {
          id: layer.id,
          name: layer.id,
          // Styles can provide a hidden _properties key with
          // layer-specific property overrides. Current workaround to layer
          // properties that could (?) eventually be controlled via carto.
          properties: (data._properties && data._properties[layer.id]) || {},
          srs: tm.srs['900913']
        };
      });

      opts.Stylesheet = _(data.styles).map(function(style,basename) {
        return {
          id: basename,
          data: style
        };
      });

      try {
        return callback(null, new carto.Renderer().render(opts));
      } catch (err) {
        if (Array.isArray(err)) {
          err.forEach(function(e) {
            carto.writeError(e, options);
          });
        } else {
          return callback(err);
        }
      }
    });
  });
};

style.registerProtocols = function(tilelive) {
  tilelive.protocols["tmstyle:"] = this;
};

module.exports = function(_tilelive, options) {
  tilelive = _tilelive;

  style.registerProtocols(tilelive);

  return style;
};
