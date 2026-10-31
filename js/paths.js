function assetURL(path) {
  return (window.__ASSETS__ && window.__ASSETS__[path]) || path;
}

async function assetJSON(path) {
  if (window.__DATA__ && window.__DATA__[path]) return window.__DATA__[path];
  return (await fetch(path)).json();
}
