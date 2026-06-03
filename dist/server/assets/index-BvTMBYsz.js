import { r as registerPlugin } from "./index-D1S26om7.js";
import "./server-3EhgLyV0.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "fs";
import "url";
import "./worker-entry-8WRFKG0u.js";
import "node:events";
import "http";
import "https";
import "./router-DGvLW1uF.js";
import "util";
import "stream";
import "zlib";
import "assert";
import "buffer";
var KeyboardStyle;
(function(KeyboardStyle2) {
  KeyboardStyle2["Dark"] = "DARK";
  KeyboardStyle2["Light"] = "LIGHT";
  KeyboardStyle2["Default"] = "DEFAULT";
})(KeyboardStyle || (KeyboardStyle = {}));
var KeyboardResize;
(function(KeyboardResize2) {
  KeyboardResize2["Body"] = "body";
  KeyboardResize2["Ionic"] = "ionic";
  KeyboardResize2["Native"] = "native";
  KeyboardResize2["None"] = "none";
})(KeyboardResize || (KeyboardResize = {}));
const Keyboard = registerPlugin("Keyboard");
export {
  Keyboard,
  KeyboardResize,
  KeyboardStyle
};
