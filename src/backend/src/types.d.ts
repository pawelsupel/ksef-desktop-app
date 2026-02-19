declare module 'crypto-js' {
  export const AES: any;
  export const enc: any;
}

declare module 'xml2js' {
  export function parseStringPromise(xml: string | Buffer): Promise<any>;
  export const parseString: any;
}
