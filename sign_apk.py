import subprocess
import os
import sys


def sign_apk(input_apk: str, keystore: str, keystore_pass: str, alias: str, output_apk: str):
    """Sign an APK using apksigner (requires Android SDK build-tools)."""
    
    if not os.path.exists(input_apk):
        print(f"Error: APK not found: {input_apk}")
        return False
    
    if not os.path.exists(keystore):
        print(f"Error: Keystore not found: {keystore}")
        return False
    
    # Try apksigner first (recommended for modern Android)
    apksigner = _find_apksigner()
    if apksigner:
        cmd = [
            apksigner, "sign",
            "--ks", keystore,
            "--ks-pass", f"pass:{keystore_pass}",
            "--ks-key-alias", alias,
            "--out", output_apk,
            input_apk
        ]
    else:
        # Fallback to jarsigner (older method)
        jarsigner = _find_jarsigner()
        if jarsigner:
            # Copy APK first since jarsigner modifies in-place
            import shutil
            shutil.copy2(input_apk, output_apk)
            cmd = [
                jarsigner,
                "-keystore", keystore,
                "-storepass", keystore_pass,
                "-signedjar", output_apk,
                input_apk,
                alias
            ]
        else:
            print("Error: Neither apksigner nor jarsigner found.")
            print("Install Android SDK build-tools or ensure jarsigner is in PATH.")
            return False
    
    print(f"Signing APK: {input_apk}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"Signed APK saved to: {output_apk}")
        return True
    else:
        print(f"Signing failed:\n{result.stderr}")
        return False


def _find_apksigner():
    """Locate apksigner in common paths."""
    # Check ANDROID_HOME / ANDROID_SDK_ROOT
    sdk_root = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if sdk_root:
        build_tools = os.path.join(sdk_root, "build-tools")
        if os.path.isdir(build_tools):
            versions = sorted(os.listdir(build_tools), reverse=True)
            for v in versions:
                path = os.path.join(build_tools, v, "apksigner")
                if os.path.exists(path):
                    return path
    
    # Check PATH
    from shutil import which
    return which("apksigner")


def _find_jarsigner():
    """Locate jarsigner in PATH (comes with JDK)."""
    from shutil import which
    return which("jarsigner")


def create_keystore(keystore: str, keystore_pass: str, alias: str):
    """Create a new signing keystore using keytool."""
    keytool = _find_keytool()
    if not keytool:
        print("Error: keytool not found. Install JDK.")
        return False
    
    cmd = [
        keytool, "-genkeypair",
        "-keystore", keystore,
        "-storepass", keystore_pass,
        "-alias", alias,
        "-keypass", keystore_pass,
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Dev, OU=Dev, O=Dev, L=City, ST=State, C=US"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"Keystore created: {keystore}")
        return True
    else:
        print(f"Keystore creation failed:\n{result.stderr}")
        return False


def _find_keytool():
    """Locate keytool in PATH or JAVA_HOME."""
    from shutil import which
    kt = which("keytool")
    if kt:
        return kt
    
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        path = os.path.join(java_home, "bin", "keytool")
        if os.path.exists(path):
            return path
    
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python sign_apk.py sign <apk> <keystore> <password> <alias> [output.apk]")
        print("  python sign_apk.py create-keystore <keystore> <password> <alias>")
        print("")
        print("Examples:")
        print("  python sign_apk.py create-keystore my.keystore changeit mykey")
        print("  python sign_apk.py sign app.apk my.keystore changeit mykey signed.apk")
        sys.exit(1)
    
    action = sys.argv[1]
    
    if action == "sign":
        if len(sys.argv) < 6:
            print("Error: sign requires <apk> <keystore> <password> <alias>")
            sys.exit(1)
        
        apk = sys.argv[2]
        ks = sys.argv[3]
        pw = sys.argv[4]
        alias = sys.argv[5]
        out = sys.argv[6] if len(sys.argv) > 6 else "signed_" + os.path.basename(apk)
        
        success = sign_apk(apk, ks, pw, alias, out)
        sys.exit(0 if success else 1)
    
    elif action == "create-keystore":
        if len(sys.argv) < 5:
            print("Error: create-keystore requires <keystore> <password> <alias>")
            sys.exit(1)
        
        ks = sys.argv[2]
        pw = sys.argv[3]
        alias = sys.argv[4]
        
        success = create_keystore(ks, pw, alias)
        sys.exit(0 if success else 1)
    
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
