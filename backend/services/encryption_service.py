"""
Encryption service for protecting PII data at rest.

Uses Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256)
to encrypt/decrypt personally identifiable information stored in the database.
"""

from cryptography.fernet import Fernet

import config


def generate_key() -> str:
    """Generate a new Fernet encryption key.

    Run this once during initial setup, then store the resulting key
    in the PII_ENCRYPTION_KEY environment variable.

    Returns:
        A URL-safe base64-encoded 32-byte key as a string.
    """
    return Fernet.generate_key().decode()


def encrypt_pii(plaintext: str) -> str:
    """Encrypt a plaintext string containing PII.

    Args:
        plaintext: The sensitive text to encrypt.

    Returns:
        A base64-encoded ciphertext string.  If no encryption key is
        configured, returns the plaintext unchanged so the application
        can still function in development without a key.
    """
    key = config.PII_ENCRYPTION_KEY
    if not key:
        return plaintext

    f = Fernet(key.encode() if isinstance(key, str) else key)
    encrypted = f.encrypt(plaintext.encode())
    return encrypted.decode()


def decrypt_pii(ciphertext: str) -> str:
    """Decrypt a previously encrypted PII string.

    Args:
        ciphertext: The base64-encoded ciphertext produced by ``encrypt_pii``.

    Returns:
        The original plaintext string.  If no encryption key is configured,
        returns the ciphertext unchanged (assumes it was never encrypted).
    """
    key = config.PII_ENCRYPTION_KEY
    if not key:
        return ciphertext

    f = Fernet(key.encode() if isinstance(key, str) else key)
    decrypted = f.decrypt(ciphertext.encode())
    return decrypted.decode()
