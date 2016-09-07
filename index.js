"use strict";

const fs = require("fs"),
    path = require("path"),
    url = require("url");

const _ = require("underscore"),
    co = require("co"),
    carto = require("carto"),
    yaml = require("js-yaml");

// lazy-load when initialized (to share a common tilelive)
var tilelive;

const defaults = {
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
  return co(function* () {
    uri = url.parse(uri || "");
    uri.query = uri.query || {};

    const fname = this.filename = path.join(uri.hostname + uri.pathname, "project.yml");

    const data = yield cb => this.info(cb);

    // override properties if necessary
    data.scale = +uri.query.scale || data.scale;

    const xml = yield cb => style.toXML(data, cb);

    const opts = {
      protocol: "vector:",
      xml: xml,
      base: path.dirname(fname),
      scale: data.scale
    };

    const tileSource = yield cb => tilelive.load(opts, cb);
    return tileSource;
  }.bind(this))
    .then(tileSource => callback(null, tileSource), err => callback(err));

};


style.prototype.info = function(callback) {
  const fname = this.filename;
  return co(function*() {
    // Load project.yml file
    const yamlStr = yield cb => fs.readFile(fname, "utf8", cb);
    const info = yaml.load(yamlStr);
    if (!info) {
      throw new Error(`Project file is invalid: ${fname}`);
    }

    // Load *.mss files
    const styles = yield (info.styles || info.Stylesheet)
      .map(filename => co(function* () {
        const mssPath = path.join(path.dirname(fname), filename);
        const mss = yield cb => fs.readFile(mssPath, "utf8", cb);
        return {filename, mss};
      }));

    // Assign mss files contents to `info`
    info.styles = {};
    styles.forEach((styl => info.styles[styl.filename] = styl.mss));

    // Assign defaults to `info`
    Object.keys(defaults)
      .forEach(k => info[k] = info[k] || defaults[k]);

    return info;
  })
    .then((info) => callback(null, info), err => callback(err));
};

// Render data to XML.
style.toXML = function(data, callback) {
  return co(function* () {
    // Load backend
    const backend = yield cb => tilelive.load(data.source, cb);

    const info = yield cb => backend.getInfo(cb);
    backend.data = info;

    // Include params to be written to XML.
    const opts = [
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
        switch (key) {
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
              fields: fields.map(function(t) {
                return t.replace(/[{}]+/g, '');
              })
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
    const layerToDef = (layer) => ({
      id: layer.id,
      name: layer.id,
      // Styles can provide a hidden _properties key with
      // layer-specific property overrides. Current workaround to layer
      // properties that could (?) eventually be controlled via carto.
      properties: (data._properties && data._properties[layer.id]) || {},
      srs: tm.srs['900913']
    });

    opts.Layer = data.layers ?
      // Layer ordering defined in style
      data.layers.map(layerId => {
        const vectorLayer = backend.data.vector_layers
          .find(vLayer => vLayer.id === layerId)
        return layerToDef(vectorLayer);
      }) :
      // Use layer ordering from source
      _(backend.data.vector_layers).map(layer => layerToDef(layer));

    opts.Stylesheet = _(data.styles).map((style, basename) => ({
      id: basename,
      data: style
    }));

    // close the backend source if possible
    if (backend.close) {
      // some close() implementations require a callback
      backend.close(() => {});
    }

    try {
      return new carto.Renderer().render(opts);
    }
    catch (err) {
      if (Array.isArray(err)) {
        err.forEach((err) => {
          carto.writeError(err, options);
        });
        throw err[0];
      } else {
        throw err;
      }
    }
  }.bind(this))
    .then(xml => callback(null, xml), err => callback(err));
};

style.registerProtocols = function(tilelive) {
  tilelive.protocols["tmstyle:"] = this;
};

module.exports = function(_tilelive, options) {
  tilelive = _tilelive;

  style.registerProtocols(tilelive);

  return style;
};
