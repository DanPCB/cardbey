@echo off
echo Installing everything for SAM 3...
py -m pip install -U huggingface_hub
py -m pip install git+https://github.com/facebookresearch/sam3.git
py -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
echo.
echo All done! SAM 3 is ready.
pause