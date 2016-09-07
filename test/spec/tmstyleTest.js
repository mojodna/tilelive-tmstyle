const tilelive = require('tilelive');
const tmstyle = require('../../');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const co = require('co');

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

  afterEach(function() {
    // Restore project.yml
    fs.writeFileSync(
      fixturePath('cities.tm2/project.yml'),
      projectYamlOrig,
      'utf8'
    );
  });
  
  describe('integration with tilelive-tmsource', function() {
    
    it('should getInfo()', () => co(function*() {
      const expectedInfo = {
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

      const tileSource = yield cb => tilelive.load(`tmstyle://${fixturePath('cities.tm2')}`, cb);
      const info = yield cb => tileSource.getInfo(cb);

      assert.deepStrictEqual(info, expectedInfo, 'should retrieve tile source info');
    }));

    it('should getTile()', () => co(function*() {
      const tileSource = yield cb => tilelive.load(`tmstyle://${fixturePath('cities.tm2')}`, cb);
      const tile = yield cb => tileSource.getTile(0, 0, 0, (err, tile) => cb(err, tile));

      const tileFixture = yield cb => fs.readFile(fixturePath('cities_0_0_0.png'), cb);
      assert(tile.equals(tileFixture), 'should match a previously generated tile image');
    }));

    it('should fail, if the yaml file is empty', () => co(function*() {
      // Override project.yml with an empty string
      yield cb => fs.writeFile(fixturePath('cities.tm2/project.yml'), '', cb);

      try {
        yield cb => tilelive.load(`tmstyle://${fixturePath('cities.tm2')}`, cb);
      }
      catch (err) {
        assert.strictEqual(err.message, 'Project file is invalid: ' + fixturePath('cities.tm2/project.yml'));
        return;
      }
      throw new Error(`tilelive.load should have thrown an error`);
    }))
    
  });

  function fixturePath(fPath) {
    return path.join(__dirname, '../fixture', fPath)
  }

});