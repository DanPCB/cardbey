import express from "express";

export function printRoutes(app, label = "ROUTES") {
  const out = [];
  const stack = app?._router?.stack || [];

  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
      out.push(`${methods.padEnd(6)} ${layer.route.path}`);
    } else if (layer.name === "router" && layer.handle?.stack) {
      for (const h of layer.handle.stack) {
        if (h.route) {
          const methods = Object.keys(h.route.methods).join(",").toUpperCase();
          out.push(`${methods.padEnd(6)} (group) -> ${h.route.path}`);
        }
      }
    }
  }

  console.log(`[${label}] mounted:\n` + out.sort().join("\n"));
}

export function requestTap(tag = "REQ") {
  return (req, _res, next) => {
    if (req.url.startsWith("/api/stream") || req.url.startsWith("/device")) {
      console.log(`[${tag}] ${req.method} ${req.url}`);
    }
    next();
  };
}
