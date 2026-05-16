#!/bin/bash
# Install SAM-3 Python Dependencies
# Run this script to install all required Python packages for SAM-3

echo "Installing SAM-3 Python dependencies..."

# Detect Python
PYTHON_CMD=""

if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    echo "Found Python: $(python3 --version)"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
    echo "Found Python: $(python --version)"
else
    echo "ERROR: Python not found!"
    echo "Please install Python 3"
    exit 1
fi

echo ""
echo "Installing packages with: $PYTHON_CMD"
echo "This may take several minutes..."

# Install packages
$PYTHON_CMD -m pip install torch torchvision pillow opencv-python numpy

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install packages"
    exit 1
fi

echo ""
echo "✅ All packages installed successfully!"
echo ""
echo "You can now restart your Node.js server."













