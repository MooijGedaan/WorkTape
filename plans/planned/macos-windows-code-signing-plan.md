# Plan: MacOS and Windows Run Without Defender Notification

**Issue:** #41
**Date:** 2026-03-29
**Type:** Enhancement

## Problem

When users install WorkTape on macOS or Windows, the OS shows security warnings (e.g., "unidentified developer" on macOS, SmartScreen warnings on Windows). This creates friction for first-time users and undermines trust in the application.

## Root Cause

The app binaries are not code-signed with recognized certificates. Without proper signing and (on macOS) notarization, the operating systems treat the application as potentially unsafe.

## Solution Overview

Code-sign the application for both platforms and notarize it for macOS. This involves obtaining certificates, configuring the Tauri build pipeline, and updating the GitHub Actions release workflow.

---

## macOS: Code Signing & Notarization

### Steps

1. **Enroll in the Apple Developer Program ($99/year)**
   - Go to https://developer.apple.com/programs/ and enroll
   - A paid account is required; the free tier cannot notarize apps

2. **Create a Developer ID Application certificate**
   - On your Mac, open Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority (to create a CSR)
   - Go to https://developer.apple.com/account/resources/certificates/list
   - Click "+" to create a new certificate, choose **Developer ID Application**
   - Upload the CSR, download the `.cer` file, and double-click to install it in your keychain
   - Verify installation: `security find-identity -v -p codesigning`

3. **Export the certificate as a .p12 file (for CI/CD)**
   - In Keychain Access, right-click the certificate > Export Items
   - Save as `.p12` format, set an export password
   - Base64-encode it: `openssl base64 -A -in certificate.p12 -out certificate-base64.txt`

4. **Set up App Store Connect API key (for notarization)**
   - Go to https://appstoreconnect.apple.com/access/integrations/api
   - Click the "+" button to create a new API key with **Developer** access
   - Note the **Issuer ID** (shown above the table) and **Key ID**
   - Download the `.p8` private key file (can only be downloaded once)

5. **Add GitHub Secrets**
   - `APPLE_CERTIFICATE` — the base64-encoded `.p12` file content
   - `APPLE_CERTIFICATE_PASSWORD` — the .p12 export password
   - `APPLE_SIGNING_IDENTITY` — the identity string from `security find-identity`
   - `APPLE_API_ISSUER` — the Issuer ID from App Store Connect
   - `APPLE_API_KEY` — the Key ID from App Store Connect
   - `APPLE_API_KEY_PATH` — will be written to a file in CI (the `.p8` contents stored as a secret)

6. **Update the GitHub Actions release workflow**
   - Before the Tauri build step on macOS, add a step to:
     - Decode and import the certificate into a temporary keychain
     - Write the API key `.p8` file to disk
   - Pass environment variables to the Tauri build step:
     - `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`
     - `APPLE_SIGNING_IDENTITY`
     - `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`
   - Tauri will automatically sign and notarize during the build

7. **Update `tauri.conf.json`** (optional, can use env vars instead)
   - Add `signingIdentity` under `bundle.macOS` if you want it in config rather than env

### Result
After these steps, macOS users can install WorkTape without any "unidentified developer" warning. Gatekeeper will recognize the notarization ticket.

---

## Windows: Code Signing

### Option A: Azure Trusted Signing (Recommended for indie developers)

This is the most accessible modern approach since traditional OV certificates now require hardware security modules.

1. **Set up an Azure account**
   - Go to https://portal.azure.com and create an account
   - Azure Trusted Signing has a cost associated; check current pricing

2. **Create a Trusted Signing Account**
   - In Azure Portal, search for "Trusted Signing" and create an account
   - Configure a certificate profile (choose the appropriate validation level)
   - Complete identity verification as required by Azure

3. **Create an App Registration for CI/CD**
   - In Azure Portal > App Registrations, create a new registration
   - Generate a client secret
   - Assign roles: "Trusted Signing Certificate Profile Signer" on your Trusted Signing account

4. **Add GitHub Secrets**
   - `AZURE_CLIENT_ID` — from the app registration
   - `AZURE_TENANT_ID` — from the app registration
   - `AZURE_CLIENT_SECRET` — the generated secret

5. **Update `tauri.conf.json`**
   - Add a custom sign command under `bundle.windows`:
     ```json
     {
       "bundle": {
         "windows": {
           "signCommand": "trusted-signing-cli -e <ENDPOINT> -a <ACCOUNT_NAME> -c <PROFILE_NAME> -d WorkTape %1"
         }
       }
     }
     ```

6. **Update the GitHub Actions release workflow**
   - On the Windows build step, add:
     - Install `trusted-signing-cli`: `cargo install trusted-signing-cli`
     - Pass `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET` as env vars

### Option B: Traditional EV Certificate (Higher cost, immediate SmartScreen trust)

1. **Purchase an EV Code Signing Certificate**
   - From a CA like DigiCert, Sectigo, or GlobalSign
   - EV certificates provide immediate SmartScreen reputation (no warning period)
   - Cost is typically $300-600/year
   - The certificate comes on a hardware token (USB)

2. **Set up Azure Key Vault as HSM**
   - Create an Azure Key Vault, import the certificate
   - Install `relic` signing tool
   - Configure as described in Tauri's Azure Key Vault documentation

3. **Add GitHub Secrets and update workflow** (same pattern as Option A)

### Recommendation

**Option A (Azure Trusted Signing)** is recommended because:
- No hardware token needed
- Works natively in CI/CD
- More affordable for indie developers
- Microsoft-backed, so SmartScreen reputation builds quickly

**Note on OV certificates:** Since June 2023, OV certificates can no longer be issued as exportable files. They must be stored on HSMs. If you already have a pre-June 2023 OV certificate, it can still be used with the simpler `.pfx` import method.

### Result
After signing, Windows users will no longer see SmartScreen warnings (immediately with EV, or after reputation builds with OV/Azure Trusted Signing).

---

## Summary of Required Accounts & Costs

| Item | Cost | Required |
|------|------|----------|
| Apple Developer Program | $99/year | Yes (macOS) |
| Azure Trusted Signing | Variable (check Azure pricing) | Yes (Windows, Option A) |
| EV Code Signing Certificate | ~$300-600/year | Alternative (Windows, Option B) |

## Implementation Order

1. Set up Apple Developer account and certificates (macOS)
2. Choose and set up Windows signing method
3. Add all secrets to GitHub repository
4. Update the release workflow (`release.yml`)
5. Update `tauri.conf.json` with signing configuration
6. Do a test release to verify both platforms work without warnings

## References

- https://v2.tauri.app/distribute/sign/macos/
- https://v2.tauri.app/distribute/sign/windows/
