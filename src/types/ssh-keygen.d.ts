declare module 'ssh-keygen' {
  interface KeyPairOptions {
    type: 'rsa' | 'dsa' | 'ecdsa' | 'ed25519';
    bits?: number;
    comment?: string;
    location?: string;
    read?: boolean;
  }

  interface KeyPair {
    key: string;
    pubKey: string;
  }

  export function generateKeyPair(
    options: KeyPairOptions,
    callback: (error: Error | null, keyPair?: KeyPair) => void
  ): void;
}