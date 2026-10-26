import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'path';
register(pathToFileURL(path.join(import.meta.dirname, 'electron-stub-loader.mjs')));
