#!/usr/bin/env python3
"""
SAM-3 Inference Script
Standalone Python script for running SAM-3 (Segment Anything Model 3) inference
Can be called from Node.js child_process or run directly

Usage:
    python sam3_inference.py --image path/to/image.png --prompt "text prompt"
    python sam3_inference.py --image path/to/image.png --prompt "text prompt" --device cuda --model-path /path/to/model
"""

import argparse
import json
import sys
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
import base64

try:
    import torch
    import numpy as np
    from PIL import Image
    import cv2
except ImportError as e:
    missing_packages = []
    if 'torch' in str(e):
        missing_packages.append('torch')
    if 'PIL' in str(e) or 'Image' in str(e):
        missing_packages.append('pillow')
    if 'cv2' in str(e) or 'opencv' in str(e):
        missing_packages.append('opencv-python')
    if 'numpy' in str(e):
        missing_packages.append('numpy')
    
    error_msg = {
        "error": "Python packages not installed",
        "missing_packages": missing_packages if missing_packages else ["torch", "torchvision", "pillow", "opencv-python", "numpy"],
        "install_command": f"pip install {' '.join(missing_packages if missing_packages else ['torch', 'torchvision', 'pillow', 'opencv-python', 'numpy'])}",
        "message": f"Required packages not installed. Run: pip install torch torchvision pillow opencv-python numpy"
    }
    print(json.dumps(error_msg), file=sys.stderr)
    sys.exit(1)

# Try to import SAM2 (Meta native API)
try:
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    HAS_SAM3 = True
except ImportError:
    HAS_SAM3 = False


def download_model_if_needed(model_path: Optional[str] = None, model_name: str = "facebook/sam2-hiera-large") -> str:
    """
    Download SAM-3 model from Hugging Face if not present
    
    Args:
        model_path: Custom model path (if provided, use it)
        model_name: Hugging Face model identifier
    
    Returns:
        Path to model (either custom or downloaded)
    """
    # If local .pt file provided and exists, use it directly
    if model_path and os.path.exists(model_path):
        return model_path
    
    # Default to Hugging Face cache or download
    try:
        from huggingface_hub import hf_hub_download
        cache_dir = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
        
        # Try to download or use cached model
        try:
            model_path = hf_hub_download(
                repo_id=model_name,
                filename="pytorch_model.bin",
                cache_dir=cache_dir
            )
            return os.path.dirname(model_path)
        except Exception as e:
            print(f"Warning: Could not download model from Hugging Face: {e}", file=sys.stderr)
            # Fallback: return default cache path
            return os.path.join(cache_dir, "hub", model_name.replace("/", "_"))
    except ImportError:
        print("Warning: huggingface_hub not installed. Install with: pip install huggingface_hub", file=sys.stderr)
        # Return a default path
        default_path = os.path.expanduser("~/.cache/huggingface/hub")
        os.makedirs(default_path, exist_ok=True)
        return default_path


def load_image(image_path: str) -> np.ndarray:
    """Load image from file path"""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    image = Image.open(image_path).convert("RGB")
    return np.array(image)


def run_sam3_inference(
    image_path: str,
    prompt: Optional[str] = None,
    device: str = "cpu",
    model_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run SAM-3 inference on an image
    
    Args:
        image_path: Path to input image
        prompt: Text prompt for segmentation (optional)
        device: Device to use ("cuda" or "cpu")
        model_path: Custom model path (optional)
    
    Returns:
        Dictionary with masks, boxes, scores
    """
    try:
        # Load image
        image = load_image(image_path)
        h, w = image.shape[:2]
        
        # Determine device
        if device == "cuda" and torch.cuda.is_available():
            device_obj = torch.device("cuda")
        else:
            device_obj = torch.device("cpu")
        
        if not HAS_SAM3:
            # Fallback: return empty results
            return {
                "masks": [],
                "boxes": [],
                "scores": [],
                "image_width": w,
                "image_height": h,
                "error": "SAM-3 packages not available"
            }
        
        # Config paths must match Hydra package layout (see sam2.build_sam.HF_MODEL_ID_TO_FILENAMES)
        config_map = {
            "sam2_hiera_large.pt": "configs/sam2/sam2_hiera_l.yaml",
            "sam2_hiera_base_plus.pt": "configs/sam2/sam2_hiera_b+.yaml",
            "sam2_hiera_small.pt": "configs/sam2/sam2_hiera_s.yaml",
            "sam2_hiera_tiny.pt": "configs/sam2/sam2_hiera_t.yaml",
            "sam2.1_hiera_large.pt": "configs/sam2.1/sam2.1_hiera_l.yaml",
            "sam2.1_hiera_base_plus.pt": "configs/sam2.1/sam2.1_hiera_b+.yaml",
            "sam2.1_hiera_small.pt": "configs/sam2.1/sam2.1_hiera_s.yaml",
            "sam2.1_hiera_tiny.pt": "configs/sam2.1/sam2.1_hiera_t.yaml",
        }
        model_filename = os.path.basename(model_path) if model_path else ""
        config_file = config_map.get(model_filename, "configs/sam2/sam2_hiera_l.yaml")

        print(f"Loading SAM2 model: {model_path}", file=sys.stderr)
        print(f"Using config: {config_file}", file=sys.stderr)

        sam2_model = build_sam2(
            config_file=config_file,
            ckpt_path=model_path,
            device=str(device_obj),
        )
        predictor = SAM2ImagePredictor(sam2_model)
        predictor.set_image(image)

        # Use center point as default prompt
        point_coords = np.array([[w // 2, h // 2]])
        point_labels = np.array([1])

        with torch.no_grad():
            masks, scores, logits = predictor.predict(
                point_coords=point_coords,
                point_labels=point_labels,
                multimask_output=True,
            )

        # Convert masks to bounding boxes
        boxes = []
        for mask in masks:
            rows = np.any(mask, axis=1)
            cols = np.any(mask, axis=0)
            if rows.any() and cols.any():
                rmin, rmax = np.where(rows)[0][[0, -1]]
                cmin, cmax = np.where(cols)[0][[0, -1]]
                boxes.append([int(cmin), int(rmin),
                              int(cmax - cmin), int(rmax - rmin)])
            else:
                boxes.append([0, 0, w, h])

        print(f"SAM2 inference complete: {len(masks)} masks",
              file=sys.stderr)

        return {
            "masks": [m.tolist() for m in masks],
            "boxes": boxes,
            "scores": scores.tolist(),
            "image_width": w,
            "image_height": h,
        }

    except Exception as e:
        return {
            "masks": [],
            "boxes": [],
            "scores": [],
            "error": str(e)
        }


def format_output(masks: List, boxes: List, scores: List, image_width: int, image_height: int) -> List[Dict[str, Any]]:
    """
    Format SAM-3 output into standardized regions
    
    Args:
        masks: List of mask data (base64 encoded or arrays)
        boxes: List of bounding boxes
        scores: List of confidence scores
        image_width: Image width
        image_height: Image height
    
    Returns:
        List of region dictionaries
    """
    regions = []
    
    for i, (mask, box, score) in enumerate(zip(masks, boxes, scores)):
        # Filter low-confidence results
        if score < 0.7:
            continue
        
        region = {
            "id": f"region_{i}",
            "mask": mask if isinstance(mask, dict) else {"data": mask, "width": image_width, "height": image_height},
            "box": box if isinstance(box, dict) else {
                "x": box[0] if isinstance(box, (list, tuple)) else box.get("x", 0),
                "y": box[1] if isinstance(box, (list, tuple)) else box.get("y", 0),
                "width": box[2] if isinstance(box, (list, tuple)) else box.get("width", 0),
                "height": box[3] if isinstance(box, (list, tuple)) else box.get("height", 0),
            },
            "score": float(score),
        }
        regions.append(region)
    
    return regions


def main():
    parser = argparse.ArgumentParser(description="Run SAM-3 inference on an image")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--prompt", default="", help="Text prompt for segmentation")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"], help="Device to use")
    parser.add_argument("--model-path", default=None, help="Custom model path")
    parser.add_argument("--model-name", default="facebook/sam2-hiera-large", help="Hugging Face model name")
    
    args = parser.parse_args()
    
    # Validate image exists
    if not os.path.exists(args.image):
        print(json.dumps({
            "error": f"Image not found: {args.image}",
            "regions": []
        }), file=sys.stderr)
        sys.exit(1)
    
    try:
        # Download model if needed
        model_path = download_model_if_needed(args.model_path, args.model_name)
        
        # Run inference
        result = run_sam3_inference(
            image_path=args.image,
            prompt=args.prompt if args.prompt else None,
            device=args.device,
            model_path=model_path
        )
        
        # Format output
        regions = format_output(
            result.get("masks", []),
            result.get("boxes", []),
            result.get("scores", []),
            result.get("image_width", 0),
            result.get("image_height", 0)
        )
        
        # Output JSON
        output = {
            "regions": regions,
            "image_width": result.get("image_width", 0),
            "image_height": result.get("image_height", 0),
        }
        
        if "error" in result:
            output["error"] = result["error"]
        
        print(json.dumps(output))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "regions": []
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

