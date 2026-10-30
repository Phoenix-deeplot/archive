// Where things are. DIST: the built demo site the tests open (http://127.0.0.1:8820/ serves it); SRC: the project folder under test (the one the demo was built from).
const path = require('path');
const HERE = __dirname;
module.exports = {
  HERE,
  SRC: process.env.E2E_SRC || path.resolve(HERE, '..', '..'),
  DIST: (process.env.E2E_DIST || path.join(HERE, '.demo', 'dist')).replace(/\\/g, '/'),
  SHOTS: (process.env.E2E_SHOTS || path.join(HERE, 'shots')).replace(/\\/g, '/'),
  SHELF_DIRECTORY: process.env.SHELF_DIRECTORY || 'E:/Ztree/shelf-directory',
};
