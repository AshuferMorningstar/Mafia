#!/usr/bin/env python3
import http.server
import ssl
import socketserver
import os
import subprocess

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

# Create SSL context
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)

# Generate self-signed certificate if it doesn't exist
cert_file = 'localhost.pem'
key_file = 'localhost-key.pem'

if not os.path.exists(cert_file) or not os.path.exists(key_file):
    print("Generating self-signed certificate...")
    # Create a config file for the certificate
    config_content = """[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Organization
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
IP.1 = 127.0.0.1
"""
    with open('cert.conf', 'w') as f:
        f.write(config_content)
    
    # Generate the certificate
    subprocess.run([
        'openssl', 'req', '-new', '-x509', '-keyout', key_file, '-out', cert_file, 
        '-days', '365', '-nodes', '-config', 'cert.conf'
    ], check=True)
    
    # Clean up config file
    os.remove('cert.conf')
    print(f"Certificate generated: {cert_file}")

try:
    context.load_cert_chain(cert_file, key_file)
except Exception as e:
    print(f"Error loading certificate: {e}")
    print("Falling back to HTTP server...")
    # Fall back to HTTP
    PORT = 8081
    with socketserver.TCPServer(("127.0.0.1", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"Serving HTTP on 127.0.0.1 port {PORT} (http://127.0.0.1:{PORT}/)")
        httpd.serve_forever()

PORT = 8443
with socketserver.TCPServer(("127.0.0.1", PORT), CustomHTTPRequestHandler) as httpd:
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print(f"Serving HTTPS on 127.0.0.1 port {PORT} (https://127.0.0.1:{PORT}/)")
    print("Note: You'll need to accept the self-signed certificate warning in your browser")
    httpd.serve_forever()
