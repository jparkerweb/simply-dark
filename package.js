const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Create the 'chrome store' directory if it doesn't exist
const outputDir = path.join(__dirname, 'chrome store');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const output = fs.createWriteStream(path.join(outputDir, 'simply-dark.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level
});

output.on('close', function() {
  console.log(`Archive created: ${archive.pointer()} total bytes`);
  console.log(`visit https://chrome.google.com/webstore/developer/dashboard to upload the new version`);
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Add the images directory
archive.directory('images', 'images');

// Add individual files
const files = [
  'background.js',
  'content.js',
  'dark-mode.css',
  'domainPreferences.js',
  'earlyDarkMode.js',
  'manifest.json',
  'popup.css',
  'popup.html',
  'popup.js'
];

files.forEach(file => {
  archive.file(file, { name: file });
});

archive.finalize();