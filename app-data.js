// App data layout and the one-time migration from the legacy Electron userData folder.
// Pure filesystem helpers (no Electron), so they can be tested outside the app.
const fs = require('fs');
const path = require('path');

const DATA_DIRNAME = '.quotawidget';

function dataPaths(home) {
  const dataDir = path.join(home, DATA_DIRNAME);
  return {
    dataDir,
    profilesDir: path.join(dataDir, 'profiles'),
    config: path.join(dataDir, 'config.json'),
    marker: path.join(dataDir, '.migrated-from-appdata'),
  };
}

// Older versions could leave keys or custom provider specs in plain text in their
// config. Remove those once the new config exists (encrypted blobs stay untouched).
function sanitizeLegacyConfig(file, secretKeys) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  for (const k of secretKeys) {
    if (k in parsed) {
      delete parsed[k];
      changed = true;
    }
  }
  for (const k of ['customProviders', 'customProvidersEnc']) {
    if (k in parsed) {
      delete parsed[k];
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
  return changed;
}

// Copies the persistent provider partitions once. config.json is NOT copied: the main
// process reads the legacy config directly and writes the new one already encrypted.
function migrateLegacyData(paths, legacyDir) {
  if (!legacyDir || legacyDir === paths.dataDir || fs.existsSync(paths.marker)) return { migrated: false, ok: true, errors: [] };
  const errors = [];

  try {
    const legacyPartitions = path.join(legacyDir, 'Partitions');
    const newPartitions = path.join(paths.profilesDir, 'Partitions');
    if (fs.existsSync(legacyPartitions)) {
      fs.cpSync(legacyPartitions, newPartitions, { recursive: true, force: false, errorOnExist: false });
    }
  } catch (e) {
    errors.push(`profiles: ${e && e.message ? e.message : e}`);
  }

  if (!errors.length) {
    try {
      fs.writeFileSync(paths.marker, new Date().toISOString());
    } catch (e) {
      errors.push(`marker: ${e && e.message ? e.message : e}`);
    }
  }
  return { migrated: true, ok: !errors.length, errors };
}

function prepareDataDir(home, legacyDir) {
  const paths = dataPaths(home);
  fs.mkdirSync(paths.profilesDir, { recursive: true });
  const result = migrateLegacyData(paths, legacyDir);
  return { ...paths, ...result };
}

// Write JSON through a temp file and rename it into place, so a crash cannot leave
// a half-written config.json behind.
function writeJsonAtomic(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

module.exports = { DATA_DIRNAME, dataPaths, sanitizeLegacyConfig, migrateLegacyData, prepareDataDir, writeJsonAtomic };
