require('babel-polyfill');
//creates uploads dir
function checkDir() {
    try {
        fs.statSync(config.uploads_directory);
    } catch (e) {
        log(`Creating uploads directory at ${config.uploads_directory}`);
        fs.mkdirSync(config.uploads_directory);
        checkDir();
    }
}

checkDir();
require('./server');