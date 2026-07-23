#!/bin/bash

# ================================================================================
# CODE VED PWA Build Script
# ================================================================================
# This script compiles, bundles, and prepares the PWA for deployment
# ================================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "============================================"
echo "  CODE VED PWA Build Script"
echo "============================================"
echo ""

# Configuration
DIST_DIR="dist"
BUILD_TIME=$(date +"%Y-%m-%d %H:%M:%S")

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check required files
check_files() {
    log_info "Checking required files..."
    
    required_files=(
        "index.html"
        "manifest.json"
        "sw.js"
        "offline.html"
        "logo.png"
        "css/style.css"
        "js/script.js"
        "js/markdownRenderer.js"
    )
    
    missing_files=()
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ] && [ ! -d "$file" ]; then
            missing_files+=("$file")
        fi
    done
    
    if [ ${#missing_files[@]} -eq 0 ]; then
        log_success "All required files present"
    else
        log_error "Missing files: ${missing_files[*]}"
        exit 1
    fi
}

# Validate manifest.json
validate_manifest() {
    log_info "Validating manifest.json..."
    
    if command -v node &> /dev/null; then
        node -e "
            const fs = require('fs');
            try {
                const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
                const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
                const missing = required.filter(key => !manifest[key]);
                if (missing.length > 0) {
                    console.error('Missing required fields:', missing.join(', '));
                    process.exit(1);
                }
                console.log('✓ manifest.json is valid');
            } catch (e) {
                console.error('Invalid JSON:', e.message);
                process.exit(1);
            }
        "
        log_success "manifest.json validated"
    else
        log_warning "Node.js not found, skipping manifest validation"
    fi
}

# Create distribution directory
create_dist() {
    log_info "Creating distribution directory..."
    
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR"
    
    log_success "Distribution directory created: $DIST_DIR"
}

# Copy files to dist
copy_files() {
    log_info "Copying files to distribution..."
    
    # Copy root files
    cp index.html "$DIST_DIR/"
    cp manifest.json "$DIST_DIR/"
    cp sw.js "$DIST_DIR/"
    cp offline.html "$DIST_DIR/"
    cp logo*.png "$DIST_DIR/" 2>/dev/null || true
    
    # Copy directories
    cp -r css "$DIST_DIR/"
    cp -r js "$DIST_DIR/"
    
    log_success "Files copied to distribution"
}

# Generate service worker version
update_sw_version() {
    log_info "Updating Service Worker version..."
    
    VERSION=$(date +%s)
    
    # Add version comment to sw.js if not present
    if ! grep -q "VERSION:" sw.js; then
        sed -i "1s|^|// VERSION: $VERSION\n|" sw.js
    else
        sed -i "s|// VERSION: .*|// VERSION: $VERSION|" sw.js
    fi
    
    log_success "Service Worker version updated: $VERSION"
}

# Create build info
create_build_info() {
    log_info "Creating build information..."
    
    cat > "$DIST_DIR/BUILD_INFO.json" << EOF
{
    "version": "$(date +%Y%m%d%H%M%S)",
    "buildTime": "$BUILD_TIME",
    "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo 'N/A')",
    "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/A')"
}
EOF
    
    log_success "Build information created"
}

# Create archive
create_archive() {
    log_info "Creating deployment archive..."
    
    ARCHIVE_NAME="pwa-package-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czvf "$ARCHIVE_NAME" "$DIST_DIR/"
    
    log_success "Archive created: $ARCHIVE_NAME"
}

# Show summary
show_summary() {
    echo ""
    echo "============================================"
    echo "  Build Complete!"
    echo "============================================"
    echo ""
    echo "📦 Distribution: $DIST_DIR/"
    echo "📦 Archive: $(ls -t pwa-package-*.tar.gz | head -1)"
    echo ""
    echo "To serve locally:"
    echo "  npx serve $DIST_DIR/"
    echo ""
    echo "PWA Features:"
    echo "  ✓ Offline support with Service Worker"
    echo "  ✓ Installable on mobile and desktop"
    echo "  ✓ Custom glassmorphism offline page"
    echo "  ✓ Native app feel"
    echo "  ✓ Background sync capability"
    echo "  ✓ Push notification support"
    echo ""
}

# Main execution
main() {
    check_files
    validate_manifest
    create_dist
    copy_files
    update_sw_version
    create_build_info
    create_archive
    show_summary
}

# Run main function
main "$@"
