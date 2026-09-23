#!/bin/sh
# ---------------------------------------------------------------------------
# Construit, pour CHAQUE entrée de addons.json qui déclare un "bundlePort",
# une version embarquée de l'addon (clonée depuis son "repository", buildée,
# élaguée) sous ./out/<slug>/ — copiée telle quelle dans l'image finale du
# panel (voir Dockerfile, stage "addons-builder").
#
# Ajouter un futur addon officiel à embarquer = ajouter une entrée avec
# "bundlePort" dans addons.json, RIEN d'autre à toucher ici ni dans le
# Dockerfile — ce script boucle dynamiquement sur le JSON.
#
# Layout attendu par addon (convention des addons officiels Bloume SAS,
# NestJS + React — cf. docs/addons/overview.md "Stack obligatoire") :
#   <repo>/api/{package.json,src/,uhq-manifest.json au niveau racine}
#   <repo>/web/{package.json,src/}
# Layout produit dans out/<slug>/ (repris tel quel par ManifestController
# des addons officiels : `__dirname/../../../uhq-manifest.json`) :
#   out/<slug>/uhq-manifest.json
#   out/<slug>/api/dist/main.js
#   out/<slug>/api/node_modules/
#   out/<slug>/web/dist/
# ---------------------------------------------------------------------------
set -e

mkdir -p out

jq -c '.[] | select(.bundlePort != null)' addons.json | while IFS= read -r entry; do
  slug=$(echo "$entry" | jq -r '.slug')
  repo=$(echo "$entry" | jq -r '.repository')
  echo "==> [bundled-addons] Building '$slug' from $repo"

  rm -rf "src-$slug"
  git clone --depth 1 "$repo" "src-$slug"
  (
    cd "src-$slug"
    npm install --prefix api --no-audit --no-fund --legacy-peer-deps
    npm install --prefix web --no-audit --no-fund --legacy-peer-deps
    npm run build --prefix web
    npm run build --prefix api
    npm prune --prefix api --production --legacy-peer-deps
  )

  dest="out/$slug"
  mkdir -p "$dest/api" "$dest/web"
  cp -r "src-$slug/api/dist" "$dest/api/dist"
  cp -r "src-$slug/api/node_modules" "$dest/api/node_modules"
  cp -r "src-$slug/web/dist" "$dest/web/dist"
  if [ -f "src-$slug/uhq-manifest.json" ]; then
    cp "src-$slug/uhq-manifest.json" "$dest/uhq-manifest.json"
  fi
  rm -rf "src-$slug"
  echo "==> [bundled-addons] '$slug' ready at $dest"
done

echo "==> [bundled-addons] Done."
