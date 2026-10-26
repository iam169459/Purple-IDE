const STUB = `
export const app = { getPath: () => process.env.PURPLE_TEST_USERDATA || '/tmp/purple-test-userdata', whenReady: () => Promise.resolve() };
export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s) => Buffer.from(s, 'utf-8'),
  decryptString: (b) => b.toString('utf-8'),
};
export class BrowserWindow {}
export const ipcMain = { handle() {}, on() {} };
const electron = { app, safeStorage, BrowserWindow, ipcMain };
export default electron;
`;

export async function resolve(specifier, context, next) {
  if (specifier === 'electron') {
    return {
      shortCircuit: true,
      url: 'data:text/javascript;base64,' + Buffer.from(STUB).toString('base64'),
    };
  }
  return next(specifier, context);
}
