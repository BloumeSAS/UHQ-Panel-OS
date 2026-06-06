const fs = require('fs');
const path = require('path');

// 1. Lire la nouvelle version depuis le package.json racine (mis à jour par npm)
const rootPackagePath = path.join(__dirname, 'package.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
const newVersion = rootPackage.version;

console.log(`Synchronisation de la version ${newVersion} vers les paquets de l'application...`);

// 2. Fichiers à mettre à jour
const filesToUpdate = [
  { path: path.join(__dirname, 'api/package.json'), indent: 2 },
  { path: path.join(__dirname, 'web/package.json'), indent: 2 }
];

filesToUpdate.forEach(({ path: filePath, indent }) => {
  if (fs.existsSync(filePath)) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    content.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(content, null, indent) + '\n', 'utf8');
    console.log(`✓ Mis à jour : ${path.relative(__dirname, filePath)}`);
  } else {
    console.warn(`⚠ Fichier introuvable : ${path.relative(__dirname, filePath)}`);
  }
});

console.log('Synchronisation terminée.');
