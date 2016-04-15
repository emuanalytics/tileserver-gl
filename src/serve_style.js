'use strict';

var path = require('path'),
    fs = require('fs');

var clone = require('clone'),
    express = require('express');


module.exports = function(options, repo, params, id, reportVector, reportVectorComposite, reportFont) {
  var app = express().disable('x-powered-by');

  var styleFile = path.join(options.paths.styles, params.style);

  var styleJSON = clone(require(styleFile));
  Object.keys(styleJSON.sources).forEach(function(name) {
    var source = styleJSON.sources[name];
    var url = source.url;
    if (url.lastIndexOf('mbtiles:', 0) === 0) {
      var mbtilesid = url.substring('mbtiles://'.length);
      var submbtiles = mbtilesid.split(',');
      var ids = [];
      submbtiles.forEach(function(mbtiles) {
        ids.push(reportVector(mbtiles));
      });
      var id = reportVectorComposite(ids);
      source.url = 'local://vector/' + id + '.json';
    }
  });

  var findFontReferences = function(obj) {
    Object.keys(obj).forEach(function(key) {
      var value = obj[key];
      if (key == 'text-font') {
        if (value && value.length > 0) {
          value.forEach(reportFont);
        }
      } else if (value && typeof value == 'object') {
        findFontReferences(value);
      }
    });
  };
  styleJSON.layers.forEach(findFontReferences);

  var spritePath = path.join(options.paths.sprites,
                             path.basename(styleFile, '.json'));

  styleJSON.sprite = 'local://styles/' + id + '/sprite';
  styleJSON.glyphs = 'local://fonts/{fontstack}/{range}.pbf';

  repo[id] = styleJSON;

  app.get('/styles/' + id + '.json', function(req, res, next) {
    var fixUrl = function(url) {
      return url.replace(
          'local://', req.protocol + '://' + req.headers.host + '/');
    };

    var styleJSON_ = clone(styleJSON);
    Object.keys(styleJSON_.sources).forEach(function(name) {
      var source = styleJSON_.sources[name];
      source.url = fixUrl(source.url);
    });
    styleJSON_.sprite = fixUrl(styleJSON_.sprite);
    styleJSON_.glyphs = fixUrl(styleJSON_.glyphs);
    return res.send(styleJSON_);
  });

  app.get('/styles/' + id + '/sprite:scale(@[23]x)?\.:format([\\w]+)',
      function(req, res, next) {
    var scale = req.params.scale,
        format = req.params.format;
    var filename = spritePath + (scale || '') + '.' + format;
    return fs.readFile(filename, function(err, data) {
      if (err) {
        console.log('Sprite load error:', filename);
        return res.status(404).send('File not found');
      } else {
        if (format == 'json') res.header('Content-type', 'application/json');
        if (format == 'png') res.header('Content-type', 'image/png');
        return res.send(data);
      }
    });
  });

  return app;
};
