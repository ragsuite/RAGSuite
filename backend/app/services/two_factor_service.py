"""
Two-Factor Authentication Service
Handles TOTP generation, QR code creation, and verification
"""
import pyotp
import qrcode
from io import BytesIO
import base64
import secrets
import json
import hashlib
from typing import List, Optional

# Replaced passlib with standard library hashlib to avoid bcrypt 72 byte limit and library incompatibility
# Using SHA-256 with salt for secure storage of backup codes


def generate_totp_secret() -> str:
    """
    Generate a new TOTP secret key.
    
    Returns:
        str: Base32-encoded TOTP secret
    """
    return pyotp.random_base32()


def generate_qr_code(secret: str, username: str, issuer: str = "RAGSuite") -> str:
    """
    Generate QR code as base64 data URL for TOTP setup.
    
    Args:
        secret: TOTP secret key (base32)
        username: Username for the provisioning URI
        issuer: Service name (default: "RAGSuite")
    
    Returns:
        str: Data URL of QR code image (format: data:image/png;base64,...)
    """
    # Create TOTP provisioning URI
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=username,
        issuer_name=issuer
    )
    
    # Generate QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=5,
    )
    qr.add_data(totp_uri)
    qr.make(fit=True)
    
    # Create image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64 data URL
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    img_str = base64.b64encode(buffer.getvalue()).decode()
    
    return f"data:image/png;base64,{img_str}"


def generate_backup_codes(count: int = 10) -> List[str]:
    """
    Generate backup codes for 2FA recovery.
    
    Args:
        count: Number of backup codes to generate (default: 10)
    
    Returns:
        List[str]: List of backup codes (format: XXXX-XXXX)
    """
    codes = []
    for _ in range(count):
        # Generate 8-character code (4 bytes = 8 hex chars)
        code = secrets.token_hex(4).upper()
        # Format as XXXX-XXXX
        formatted_code = f"{code[:4]}-{code[4:]}"
        codes.append(formatted_code)
    return codes


def _verify_hash(plain_code: str, hashed_code: str) -> bool:
    """
    Internal helper to verify a code against its hash.
    Format: salt(32 chars) + sha256_hash
    """
    try:
        if len(hashed_code) < 32:
            return False
        
        salt = hashed_code[:32]
        stored_hash = hashed_code[32:]
        
        calculated_hash = hashlib.sha256((plain_code + salt).encode()).hexdigest()
        return secrets.compare_digest(stored_hash, calculated_hash)
    except Exception:
        return False


def hash_backup_code(code: str) -> str:
    """
    Hash a backup code using SHA-256 + Salt for secure storage.
    Replaces previously used bcrypt to avoid length limits and dependency issues.
    
    Args:
        code: Plain backup code
    
    Returns:
        str: Hashed backup code (salt + hash)
    """
    # Generate 16 bytes random salt (32 hex characters)
    salt = secrets.token_hex(16)
    # Hash code + salt
    hash_value = hashlib.sha256((code + salt).encode()).hexdigest()
    # Return salt + hash
    return salt + hash_value


def verify_backup_code(code: str, hashed_codes_json: str) -> bool:
    """
    Verify a backup code against stored hashed codes.
    
    Args:
        code: Plain backup code to verify
        hashed_codes_json: JSON string of hashed backup codes
    
    Returns:
        bool: True if code is valid, False otherwise
    """
    if not hashed_codes_json:
        return False
    
    try:
        hashed_codes = json.loads(hashed_codes_json)
        if not isinstance(hashed_codes, list):
            return False
        
        # Check each hashed code
        for hashed_code in hashed_codes:
            if _verify_hash(code, hashed_code):
                return True
    except (json.JSONDecodeError, ValueError, TypeError):
        return False
    
    return False


def store_backup_codes(codes: List[str]) -> str:
    """
    Hash and store backup codes as JSON string.
    
    Args:
        codes: List of plain backup codes
    
    Returns:
        str: JSON string of hashed backup codes
    """
    hashed_codes = [hash_backup_code(code) for code in codes]
    return json.dumps(hashed_codes)


def verify_totp_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """
    Verify a TOTP code.
    
    Args:
        secret: TOTP secret key (base32)
        code: 6-digit TOTP code to verify
        valid_window: Number of time steps to allow (default: 1)
                     This accounts for clock drift and user delay
    
    Returns:
        bool: True if code is valid, False otherwise
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not secret or not code:
        logger.warning(f"TOTP verification failed: missing secret or code (secret: {bool(secret)}, code: {bool(code)})")
        return False
    
    # Ensure code is 6 digits
    if len(code) != 6 or not code.isdigit():
        logger.warning(f"TOTP verification failed: invalid code format (length: {len(code)}, is_digit: {code.isdigit()})")
        return False
    
    try:
        # Validate secret format (should be base32)
        if len(secret) < 16:  # Base32 secrets are typically 16+ characters
            logger.error(f"TOTP verification failed: secret too short (length: {len(secret)})")
            return False
            
        totp = pyotp.TOTP(secret)
        # Try current time step
        result = totp.verify(code, valid_window=valid_window)
        
        if not result:
            # Log for debugging (don't log the actual code for security)
            logger.debug(f"TOTP verification failed: code mismatch (secret_length: {len(secret)}, window: {valid_window})")
        
        return result
    except Exception as e:
        logger.error(f"TOTP verification exception: {str(e)}")
        return False


def remove_used_backup_code(code: str, hashed_codes_json: str) -> Optional[str]:
    """
    Remove a used backup code from the stored list.
    
    Args:
        code: Plain backup code that was used
        hashed_codes_json: JSON string of hashed backup codes
    
    Returns:
        Optional[str]: Updated JSON string with used code removed, or None if not found
    """
    if not hashed_codes_json:
        return None
    
    try:
        hashed_codes = json.loads(hashed_codes_json)
        if not isinstance(hashed_codes, list):
            return None
        
        # Find and remove the used code
        updated_codes = []
        found = False
        for hashed_code in hashed_codes:
            if not found and _verify_hash(code, hashed_code):
                found = True
                # Skip this code (don't add to updated list)
                continue
            updated_codes.append(hashed_code)
        
        if not found:
            return None
        
        # Return updated JSON string
        return json.dumps(updated_codes) if updated_codes else None
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
