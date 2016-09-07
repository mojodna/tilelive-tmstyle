var tilelive = require('tilelive');
var tmstyle = require('../../');
var path = require('path');
var fs = require('fs');
var assert = require('assert');

// Register tilelive modules
tmstyle(tilelive);
require('tilelive-tmsource')(tilelive);
require('tilelive-vector').registerProtocols(tilelive);

describe('tilelive-tmstyle', function() {
  var projectYamlOrig;

  before(function() {
    projectYamlOrig = fs.readFileSync(fixturePath('cities.tm2/project.yml'), 'utf8');

    // Assign 'FIXTURE_DIR' to absolute path
    fs.writeFileSync(
      fixturePath('cities.tm2/project.yml'),
      projectYamlOrig.replace('{{FIXTURE_DIR}}', fixturePath('')),
      'utf8'
    );
  });

  after(function() {
    // Restore project.yml
    fs.writeFileSync(
      fixturePath('cities.tm2/project.yml'),
      projectYamlOrig,
      'utf8'
    );
  });
  
  describe('integration with tilelive-tmsource', function() {
    
    it('should getInfo()', function(done) {
      var expectedInfo = {
        attribution: "Attribution Text",
        bounds: [
          -180,
          -85.0511,
          180,
          85.0511
        ],
        center: [
          40,
          -20,
          4
        ],
        description: "Cities",
        format: "png8:m=h:c=128",
        maxzoom: 22,
        minzoom: 0,
        name: "cities",
        scale: "1",
        source: "tmsource://" + fixturePath('cities.tm2source')
      };

      tilelive.load(
        'tmstyle://' + fixturePath('cities.tm2'),
        function(err, tileSource) {
          if (err) { return done(err); }

          tileSource.getInfo(function(err, info) {
            if (err) { return done(err); }

            try {
              assert.deepStrictEqual(info, expectedInfo, 'should retrieve tile source info');
              done();
            }
            catch (err) { return done(err); }
          })
        }
      );
    });

    it('should getTile()', function(done) {
      tilelive.load(
        'tmstyle://' + fixturePath('cities.tm2'),
        function(err, tileSource) {
          if (err) {
            return done(err);
          }

          tileSource.getTile(0, 0, 0, function(err, tile) {
            if (err) {
              return done(err);
            }

            try {
              var tileFixture = fs.readFileSync(fixturePath('cities_0_0_0.png'));
              assert(tile.equals(tileFixture), 'should match a previously generated tile image');
              done();
            }
            catch (err) {
              return done(err);
            }
          })
        }
      )
    });
    
  });

  function fixturePath(fPath) {
    return path.join(path.join(__dirname, '../fixture', fPath))
  }

});