import { cloneQuad, createDefaultQuad } from "../grading/measurement.js";
import { getQuadSideValue, getSideHandlePositions, moveQuadSide } from "./quadControls.js";

const HANDLE_RADIUS = 26;
const HANDLE_SIZE = 42;
const HANDLE_INSET = 24;
const MAGNIFIER_SIZE = 132;
const MAGNIFIER_ZOOM = 2.3;
const PERSPECTIVE_GRID_COLUMNS = 14;
const PERSPECTIVE_GRID_ROWS = 20;
const PERSPECTIVE_STRENGTH = 0.32;
const VIEW_ZOOM_LIMITS = {
  min: 1,
  max: 2.5,
};
const PHOTO_TRANSFORM_LIMITS = {
  rotation: 15,
  tiltX: 30,
  tiltY: 30,
};

export function createDefaultPhotoTransform() {
  return {
    rotation: 0,
    tiltX: 0,
    tiltY: 0,
  };
}

export function createDefaultViewZoom() {
  return 1;
}

export function normalizeViewZoom(zoom) {
  return clamp(Number(zoom) || createDefaultViewZoom(), VIEW_ZOOM_LIMITS.min, VIEW_ZOOM_LIMITS.max);
}

export function normalizePhotoTransform(transform = {}) {
  return {
    rotation: clamp(Number(transform.rotation) || 0, -PHOTO_TRANSFORM_LIMITS.rotation, PHOTO_TRANSFORM_LIMITS.rotation),
    tiltX: clamp(Number(transform.tiltX) || 0, -PHOTO_TRANSFORM_LIMITS.tiltX, PHOTO_TRANSFORM_LIMITS.tiltX),
    tiltY: clamp(Number(transform.tiltY) || 0, -PHOTO_TRANSFORM_LIMITS.tiltY, PHOTO_TRANSFORM_LIMITS.tiltY),
  };
}

export class CanvasEditor {
  constructor(canvas, { onChange }) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onChange = onChange;
    this.sideData = null;
    this.image = null;
    this.activeLayer = "outer";
    this.zoom = 1;
    this.autoMagnifierEnabled = false;
    this.gridVisible = true;
    this.guidesVisible = true;
    this.handlesVisible = true;
    this.ignoreNextMouseDown = false;
    this.ignoreNextMouseDownTimer = null;
    this.dragState = null;
    this.lensPoint = null;
    this.magnifierBaseCanvas = document.createElement("canvas");
    this.magnifierBaseContext = this.magnifierBaseCanvas.getContext("2d");
    this.devicePixelRatio = window.devicePixelRatio || 1;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    this.bindEvents();
    this.resize();
  }

  setSideData(sideData) {
    this.sideData = sideData;
    if (this.sideData) {
      this.sideData.photoTransform = normalizePhotoTransform(this.sideData.photoTransform);
      this.sideData.viewZoom = normalizeViewZoom(this.sideData.viewZoom);
      this.zoom = this.sideData.viewZoom;
    }
    this.handlesVisible = true;
    this.loadImage(sideData?.imageDataUrl);
  }

  async setImageDataUrl(dataUrl) {
    const image = await loadImage(dataUrl);
    const outerQuad = createDefaultQuad(image.naturalWidth, image.naturalHeight, 0.055);
    const innerQuad = createDefaultQuad(image.naturalWidth, image.naturalHeight, 0.135);

    this.sideData.imageDataUrl = dataUrl;
    this.sideData.outerQuad = outerQuad;
    this.sideData.innerQuad = innerQuad;
    this.sideData.photoTransform = createDefaultPhotoTransform();
    this.sideData.viewZoom = createDefaultViewZoom();
    this.zoom = this.sideData.viewZoom;
    this.handlesVisible = true;
    this.image = image;
    this.draw();
    this.onChange?.(this.sideData);
  }

  setActiveLayer(layer) {
    this.activeLayer = layer;
    this.draw();
  }

  setZoom(zoom) {
    this.zoom = normalizeViewZoom(zoom);
    if (this.sideData) {
      this.sideData.viewZoom = this.zoom;
    }
    this.draw();
  }

  setAutoMagnifierEnabled(isEnabled) {
    this.autoMagnifierEnabled = isEnabled;
    if (!isEnabled) {
      this.lensPoint = null;
    }
    this.draw();
  }

  setGridVisible(isVisible) {
    this.gridVisible = Boolean(isVisible);
    this.draw();
  }

  setGuidesVisible(isVisible) {
    this.guidesVisible = Boolean(isVisible);
    if (!this.guidesVisible) {
      this.dragState = null;
      this.lensPoint = null;
    }
    this.draw();
  }

  setHandlesVisible(isVisible) {
    this.handlesVisible = Boolean(isVisible);
    if (!this.handlesVisible) {
      this.dragState = null;
      this.lensPoint = null;
    }
    this.draw();
  }

  setPhotoTransform(transform) {
    if (!this.sideData) {
      return;
    }

    this.sideData.photoTransform = normalizePhotoTransform(transform);
    this.draw();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.devicePixelRatio));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.devicePixelRatio));
    this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    this.draw();
  }

  draw() {
    const size = this.getCanvasSize();
    this.context.clearRect(0, 0, size.width, size.height);

    if (!this.image || !this.sideData?.imageDataUrl) {
      return;
    }

    this.context.imageSmoothingEnabled = true;
    this.drawTransformedImage();
    this.captureMagnifierBase();

    if (this.gridVisible) {
      this.drawReferenceGrid();
    }

    if (this.guidesVisible) {
      this.drawBorderHatching(this.sideData.outerQuad, this.sideData.innerQuad);
      this.drawQuad(this.sideData.outerQuad, {
        color: "#1d73d8",
        fill: "rgba(29, 115, 216, 0.08)",
        active: this.activeLayer === "outer",
      });
      this.drawQuad(this.sideData.innerQuad, {
        color: "#d85a36",
        fill: "rgba(216, 90, 54, 0.08)",
        active: this.activeLayer === "inner",
      });
    }

    if (this.guidesVisible && this.autoMagnifierEnabled && this.dragState && this.lensPoint) {
      this.drawMagnifier(this.lensPoint);
    }
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("mousedown", (event) => this.onMouseDown(event));
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    window.addEventListener("mouseup", (event) => this.onMouseUp(event));
  }

  onPointerDown(event) {
    if (!this.image || !this.sideData) {
      return;
    }

    const hit = this.findHandle(event);
    if (!hit) {
      if (this.toggleHandlesFromCanvasPoint(event)) {
        this.suppressNextMouseDown();
      }
      return;
    }

    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.dragState = {
      pointerId: event.pointerId,
      layer: hit.layer,
      side: hit.side,
    };
    this.lensPoint = this.getPointerPoint(event);
    this.draw();
  }

  onPointerMove(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    event.preventDefault();
    this.moveDraggedSide(event);
  }

  onPointerUp(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    this.canvas.releasePointerCapture(event.pointerId);
    this.dragState = null;
    this.lensPoint = null;
    this.draw();
  }

  onMouseDown(event) {
    if (this.ignoreNextMouseDown) {
      this.ignoreNextMouseDown = false;
      window.clearTimeout(this.ignoreNextMouseDownTimer);
      return;
    }

    if (this.dragState || event.pointerType || !this.image || !this.sideData) {
      return;
    }

    const hit = this.findHandle(event);
    if (!hit) {
      this.toggleHandlesFromCanvasPoint(event);
      return;
    }

    event.preventDefault();
    this.dragState = {
      pointerId: "mouse",
      layer: hit.layer,
      side: hit.side,
    };
    this.lensPoint = this.getPointerPoint(event);
    this.draw();
  }

  suppressNextMouseDown() {
    this.ignoreNextMouseDown = true;
    window.clearTimeout(this.ignoreNextMouseDownTimer);
    this.ignoreNextMouseDownTimer = window.setTimeout(() => {
      this.ignoreNextMouseDown = false;
    }, 400);
  }

  toggleHandlesFromCanvasPoint(event) {
    if (!this.guidesVisible) {
      return false;
    }

    const point = this.getPointerPoint(event);
    if (!this.isPointInsideImageRect(point)) {
      return false;
    }

    event.preventDefault();
    this.setHandlesVisible(!this.handlesVisible);
    return true;
  }

  onMouseMove(event) {
    if (!this.dragState || this.dragState.pointerId !== "mouse") {
      return;
    }

    event.preventDefault();
    this.moveDraggedSide(event);
  }

  onMouseUp(event) {
    if (!this.dragState || this.dragState.pointerId !== "mouse") {
      return;
    }

    event.preventDefault();
    this.dragState = null;
    this.lensPoint = null;
    this.draw();
  }

  moveDraggedSide(event) {
    this.lensPoint = this.getPointerPoint(event);
    const point = this.canvasToImage(this.lensPoint);
    const targetQuad = this.dragState.layer === "outer"
      ? this.sideData.outerQuad
      : this.sideData.innerQuad;

    moveQuadSide(targetQuad, this.dragState.side, this.clampImagePoint(point), {
      width: this.image.naturalWidth,
      height: this.image.naturalHeight,
    }, this.getLayerSideConstraints(this.dragState.layer, this.dragState.side));
    this.draw();
    this.onChange?.(this.sideData);
  }

  getLayerSideConstraints(layer, side) {
    const margin = 2;
    const otherQuad = layer === "outer" ? this.sideData.innerQuad : this.sideData.outerQuad;
    const otherValue = getQuadSideValue(otherQuad, side);

    if (otherValue == null) {
      return {};
    }

    if (layer === "outer") {
      if (side === "top" || side === "left") {
        return { max: otherValue - margin };
      }

      return { min: otherValue + margin };
    }

    if (side === "top" || side === "left") {
      return { min: otherValue + margin };
    }

    return { max: otherValue - margin };
  }

  drawQuad(quad, { color, fill, active }) {
    const points = quad.map((point) => this.imageToCanvas(point));

    this.context.save();
    this.context.beginPath();
    this.context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      this.context.lineTo(points[index].x, points[index].y);
    }
    this.context.closePath();
    this.context.fillStyle = fill;
    this.context.fill();
    this.context.strokeStyle = color;
    this.context.lineWidth = active ? 3 : 2;
    this.context.setLineDash(active ? [] : [8, 6]);
    this.context.stroke();
    this.context.restore();

    if (active && this.handlesVisible) {
      for (const handle of this.getCanvasSideHandles(quad)) {
        this.drawSideHandle(handle.point, handle.arrow, color);
      }
    }
  }

  drawBorderHatching(outerQuad, innerQuad) {
    if (!outerQuad || !innerQuad) {
      return;
    }

    const outerPoints = outerQuad.map((point) => this.imageToCanvas(point));
    const innerPoints = innerQuad.map((point) => this.imageToCanvas(point));
    const bounds = getPointBounds(outerPoints);

    this.context.save();
    this.context.beginPath();
    this.addQuadPath(outerPoints);
    this.addQuadPath(innerPoints);
    this.context.clip("evenodd");
    this.context.strokeStyle = "rgba(216, 90, 54, 0.58)";
    this.context.lineWidth = 2;

    const spacing = 12;
    const start = bounds.left - bounds.height - 24;
    const end = bounds.right + bounds.height + 24;

    for (let x = start; x < end; x += spacing) {
      this.context.beginPath();
      this.context.moveTo(x, bounds.bottom + 18);
      this.context.lineTo(x + bounds.height + 36, bounds.top - 18);
      this.context.stroke();
    }

    this.context.restore();
  }

  drawReferenceGrid() {
    const imageRect = this.getImageRect();
    const verticalLines = [0.25, 0.5, 0.75];
    const horizontalLines = [0.25, 0.5, 0.75];

    this.context.save();
    this.context.beginPath();
    this.context.rect(imageRect.x, imageRect.y, imageRect.width, imageRect.height);
    this.context.clip();
    this.context.lineCap = "square";

    this.context.beginPath();
    verticalLines.forEach((ratio) => {
      const x = imageRect.x + imageRect.width * ratio;
      this.context.moveTo(x, imageRect.y);
      this.context.lineTo(x, imageRect.y + imageRect.height);
    });
    horizontalLines.forEach((ratio) => {
      const y = imageRect.y + imageRect.height * ratio;
      this.context.moveTo(imageRect.x, y);
      this.context.lineTo(imageRect.x + imageRect.width, y);
    });
    this.context.lineWidth = 3;
    this.context.strokeStyle = "rgba(255, 255, 255, 0.5)";
    this.context.stroke();
    this.context.lineWidth = 1;
    this.context.strokeStyle = "rgba(29, 115, 216, 0.38)";
    this.context.stroke();

    this.context.beginPath();
    this.context.moveTo(imageRect.x + imageRect.width / 2, imageRect.y);
    this.context.lineTo(imageRect.x + imageRect.width / 2, imageRect.y + imageRect.height);
    this.context.moveTo(imageRect.x, imageRect.y + imageRect.height / 2);
    this.context.lineTo(imageRect.x + imageRect.width, imageRect.y + imageRect.height / 2);
    this.context.lineWidth = 2;
    this.context.strokeStyle = "rgba(216, 90, 54, 0.62)";
    this.context.stroke();

    this.context.beginPath();
    this.context.rect(imageRect.x, imageRect.y, imageRect.width, imageRect.height);
    this.context.lineWidth = 1.5;
    this.context.strokeStyle = "rgba(29, 115, 216, 0.44)";
    this.context.stroke();
    this.context.restore();
  }

  addQuadPath(points) {
    this.context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      this.context.lineTo(points[index].x, points[index].y);
    }
    this.context.closePath();
  }

  drawSideHandle(point, arrow, color) {
    this.context.save();
    this.context.fillStyle = color;
    this.context.strokeStyle = "#ffffff";
    this.context.lineWidth = 2;
    this.roundRect(
      point.x - HANDLE_SIZE / 2,
      point.y - HANDLE_SIZE / 2,
      HANDLE_SIZE,
      HANDLE_SIZE,
      8,
    );
    this.context.fill();
    this.context.stroke();
    this.context.fillStyle = "#ffffff";
    this.context.font = "700 28px system-ui, sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(arrow, point.x, point.y - 1);
    this.context.restore();
  }

  roundRect(x, y, width, height, radius) {
    this.context.beginPath();
    this.context.moveTo(x + radius, y);
    this.context.lineTo(x + width - radius, y);
    this.context.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.context.lineTo(x + width, y + height - radius);
    this.context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.context.lineTo(x + radius, y + height);
    this.context.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.context.lineTo(x, y + radius);
    this.context.quadraticCurveTo(x, y, x + radius, y);
    this.context.closePath();
  }

  findHandle(event) {
    if (!this.guidesVisible || !this.handlesVisible) {
      return null;
    }

    const pointer = this.getPointerPoint(event);
    const candidateLayers = [this.activeLayer];

    for (const layer of candidateLayers) {
      const quad = layer === "outer" ? this.sideData.outerQuad : this.sideData.innerQuad;
      const side = findClosestSideHandle(
        pointer,
        this.getCanvasSideHandles(quad),
        HANDLE_RADIUS,
      );

      if (side) {
        this.activeLayer = layer;
        return { layer, side };
      }
    }

    return null;
  }

  getCanvasSideHandles(quad) {
    return getSideHandlePositions(quad).map((handle) => ({
      ...handle,
      point: this.getInsetHandlePoint(this.imageToCanvas(handle.point), handle.side),
    }));
  }

  getInsetHandlePoint(point, side) {
    if (side === "top") {
      return { x: point.x, y: point.y + HANDLE_INSET };
    }

    if (side === "bottom") {
      return { x: point.x, y: point.y - HANDLE_INSET };
    }

    if (side === "left") {
      return { x: point.x + HANDLE_INSET, y: point.y };
    }

    return { x: point.x - HANDLE_INSET, y: point.y };
  }

  drawMagnifier(canvasPoint) {
    const canvasSize = this.getCanvasSize();
    const focusPoint = {
      x: clamp(canvasPoint.x, 0, canvasSize.width),
      y: clamp(canvasPoint.y, 0, canvasSize.height),
    };
    const sourceSize = Math.min(
      MAGNIFIER_SIZE / MAGNIFIER_ZOOM,
      canvasSize.width,
      canvasSize.height,
    );
    const maxSourceX = Math.max(0, canvasSize.width - sourceSize);
    const maxSourceY = Math.max(0, canvasSize.height - sourceSize);
    const sourceX = clamp(focusPoint.x - sourceSize / 2, 0, maxSourceX);
    const sourceY = clamp(focusPoint.y - sourceSize / 2, 0, maxSourceY);
    const sourceScale = this.devicePixelRatio;
    const destination = this.getMagnifierDestination(focusPoint);
    const crosshair = {
      x: destination.x + ((focusPoint.x - sourceX) / sourceSize) * MAGNIFIER_SIZE,
      y: destination.y + ((focusPoint.y - sourceY) / sourceSize) * MAGNIFIER_SIZE,
    };

    this.context.save();
    this.roundRect(destination.x, destination.y, MAGNIFIER_SIZE, MAGNIFIER_SIZE, 14);
    this.context.clip();
    this.context.drawImage(
      this.magnifierBaseCanvas,
      sourceX * sourceScale,
      sourceY * sourceScale,
      sourceSize * sourceScale,
      sourceSize * sourceScale,
      destination.x,
      destination.y,
      MAGNIFIER_SIZE,
      MAGNIFIER_SIZE,
    );
    this.context.restore();

    this.context.save();
    this.roundRect(destination.x, destination.y, MAGNIFIER_SIZE, MAGNIFIER_SIZE, 14);
    this.context.lineWidth = 4;
    this.context.strokeStyle = "#ffffff";
    this.context.stroke();
    this.context.lineWidth = 2;
    this.context.strokeStyle = "#111816";
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(crosshair.x, destination.y + 12);
    this.context.lineTo(crosshair.x, destination.y + MAGNIFIER_SIZE - 12);
    this.context.moveTo(destination.x + 12, crosshair.y);
    this.context.lineTo(destination.x + MAGNIFIER_SIZE - 12, crosshair.y);
    this.context.strokeStyle = "rgba(216, 90, 54, 0.86)";
    this.context.lineWidth = 1.5;
    this.context.stroke();
    this.context.beginPath();
    this.context.arc(crosshair.x, crosshair.y, 3.5, 0, Math.PI * 2);
    this.context.fillStyle = "rgba(216, 90, 54, 0.9)";
    this.context.fill();
    this.context.restore();
  }

  captureMagnifierBase() {
    if (
      this.magnifierBaseCanvas.width !== this.canvas.width
      || this.magnifierBaseCanvas.height !== this.canvas.height
    ) {
      this.magnifierBaseCanvas.width = this.canvas.width;
      this.magnifierBaseCanvas.height = this.canvas.height;
    }

    this.magnifierBaseContext.setTransform(1, 0, 0, 1, 0, 0);
    this.magnifierBaseContext.clearRect(0, 0, this.magnifierBaseCanvas.width, this.magnifierBaseCanvas.height);
    this.magnifierBaseContext.drawImage(this.canvas, 0, 0);
  }

  getMagnifierDestination(point) {
    const size = this.getCanvasSize();
    const offset = 18;
    const maxX = Math.max(8, size.width - MAGNIFIER_SIZE - 8);
    const maxY = Math.max(8, size.height - MAGNIFIER_SIZE - 8);
    let x = point.x + offset;
    let y = point.y - MAGNIFIER_SIZE - offset;

    if (x + MAGNIFIER_SIZE > size.width - 8) {
      x = point.x - MAGNIFIER_SIZE - offset;
    }

    if (y < 8) {
      y = point.y + offset;
    }

    return {
      x: clamp(x, 8, maxX),
      y: clamp(y, 8, maxY),
    };
  }

  getPointerPoint(event) {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  isPointInsideImageRect(point) {
    const imageRect = this.getImageRect();

    return point.x >= imageRect.x
      && point.x <= imageRect.x + imageRect.width
      && point.y >= imageRect.y
      && point.y <= imageRect.y + imageRect.height;
  }

  imageToCanvas(point) {
    return transformPoint(this.getBaseImageMatrix(), point);
  }

  canvasToImage(point) {
    const inverseMatrix = invertMatrix(this.getBaseImageMatrix());

    return inverseMatrix ? transformPoint(inverseMatrix, point) : point;
  }

  drawTransformedImage() {
    const transform = this.getPhotoTransform();

    if (!hasPhotoTransform(transform)) {
      const matrix = this.getBaseImageMatrix();

      this.context.save();
      this.context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      this.context.drawImage(this.image, 0, 0);
      this.context.restore();
      return;
    }

    this.drawPerspectiveImage(transform, this.getPhotoFitScale(transform));
  }

  drawPerspectiveImage(transform, fitScale) {
    const columns = PERSPECTIVE_GRID_COLUMNS;
    const rows = PERSPECTIVE_GRID_ROWS;
    const cellWidth = this.image.naturalWidth / columns;
    const cellHeight = this.image.naturalHeight / rows;
    const points = [];

    for (let row = 0; row <= rows; row += 1) {
      points[row] = [];
      for (let column = 0; column <= columns; column += 1) {
        points[row][column] = this.getCorrectedPhotoPoint({
          x: column * cellWidth,
          y: row * cellHeight,
        }, transform, fitScale);
      }
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const sourceLeft = column * cellWidth;
        const sourceTop = row * cellHeight;
        const sourceRight = sourceLeft + cellWidth;
        const sourceBottom = sourceTop + cellHeight;
        const topLeft = points[row][column];
        const topRight = points[row][column + 1];
        const bottomLeft = points[row + 1][column];
        const bottomRight = points[row + 1][column + 1];

        this.drawImageTriangle(
          [
            { x: sourceLeft, y: sourceTop },
            { x: sourceRight, y: sourceTop },
            { x: sourceLeft, y: sourceBottom },
          ],
          [topLeft, topRight, bottomLeft],
        );
        this.drawImageTriangle(
          [
            { x: sourceRight, y: sourceTop },
            { x: sourceRight, y: sourceBottom },
            { x: sourceLeft, y: sourceBottom },
          ],
          [topRight, bottomRight, bottomLeft],
        );
      }
    }
  }

  drawImageTriangle(source, destination) {
    const matrix = getTriangleTransform(source, destination);

    if (!matrix) {
      return;
    }

    this.context.save();
    this.context.beginPath();
    this.context.moveTo(destination[0].x, destination[0].y);
    this.context.lineTo(destination[1].x, destination[1].y);
    this.context.lineTo(destination[2].x, destination[2].y);
    this.context.closePath();
    this.context.clip();
    this.context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    this.context.drawImage(this.image, 0, 0);
    this.context.restore();
  }

  getCorrectedPhotoPoint(point, transform, fitScale) {
    const imageRect = this.getImageRect();
    const center = {
      x: imageRect.x + imageRect.width / 2,
      y: imageRect.y + imageRect.height / 2,
    };
    const basePoint = transformPoint(this.getBaseImageMatrix(), point);
    const halfWidth = Math.max(imageRect.width / 2, 1);
    const halfHeight = Math.max(imageRect.height / 2, 1);
    const normalizedX = (basePoint.x - center.x) / halfWidth;
    const normalizedY = (basePoint.y - center.y) / halfHeight;
    const verticalTilt = transform.tiltY / PHOTO_TRANSFORM_LIMITS.tiltY;
    const horizontalTilt = transform.tiltX / PHOTO_TRANSFORM_LIMITS.tiltX;
    const perspective = clamp(
      1
        + verticalTilt * normalizedY * PERSPECTIVE_STRENGTH
        + horizontalTilt * normalizedX * PERSPECTIVE_STRENGTH,
      0.62,
      1.62,
    );
    const projectedX = (basePoint.x - center.x) / perspective;
    const projectedY = (basePoint.y - center.y) / perspective;
    const rotationRadians = degreesToRadians(transform.rotation);
    const cosine = Math.cos(rotationRadians);
    const sine = Math.sin(rotationRadians);
    const rotatedX = projectedX * cosine - projectedY * sine;
    const rotatedY = projectedX * sine + projectedY * cosine;

    return {
      x: center.x + rotatedX * fitScale,
      y: center.y + rotatedY * fitScale,
    };
  }

  getPhotoFitScale(transform) {
    const corners = [
      { x: 0, y: 0 },
      { x: this.image.naturalWidth, y: 0 },
      { x: this.image.naturalWidth, y: this.image.naturalHeight },
      { x: 0, y: this.image.naturalHeight },
    ];
    const bounds = getPointBounds(
      corners.map((point) => this.getCorrectedPhotoPoint(point, transform, 1)),
    );

    const size = this.getCanvasSize();
    const padding = 10;

    return Math.min(
      1,
      Math.max(0.1, (size.width - padding * 2) / Math.max(bounds.width, 1)),
      Math.max(0.1, (size.height - padding * 2) / Math.max(bounds.height, 1)),
    );
  }

  getBaseImageMatrix() {
    const imageRect = this.getImageRect();

    return multiplyMatrices(
      createTranslationMatrix(imageRect.x, imageRect.y),
      createScaleMatrix(imageRect.scale, imageRect.scale),
    );
  }

  getPhotoTransform() {
    if (!this.sideData) {
      return createDefaultPhotoTransform();
    }

    this.sideData.photoTransform = normalizePhotoTransform(this.sideData.photoTransform);
    return this.sideData.photoTransform;
  }

  clampImagePoint(point) {
    return {
      x: clamp(point.x, 0, this.image.naturalWidth),
      y: clamp(point.y, 0, this.image.naturalHeight),
    };
  }

  getImageRect() {
    const size = this.getCanvasSize();
    const baseScale = Math.min(
      size.width / this.image.naturalWidth,
      size.height / this.image.naturalHeight,
    );
    const scale = baseScale * this.zoom;
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;

    return {
      x: (size.width - width) / 2,
      y: (size.height - height) / 2,
      width,
      height,
      scale,
    };
  }

  getCanvasSize() {
    return {
      width: this.canvas.width / this.devicePixelRatio,
      height: this.canvas.height / this.devicePixelRatio,
    };
  }

  loadImage(dataUrl) {
    if (!dataUrl) {
      this.image = null;
      this.draw();
      return;
    }

    loadImage(dataUrl).then((image) => {
      if (this.sideData?.imageDataUrl !== dataUrl) {
        return;
      }

      this.image = image;
      this.sideData.outerQuad = this.sideData.outerQuad
        ? cloneQuad(this.sideData.outerQuad)
        : createDefaultQuad(image.naturalWidth, image.naturalHeight, 0.055);
      this.sideData.innerQuad = this.sideData.innerQuad
        ? cloneQuad(this.sideData.innerQuad)
        : createDefaultQuad(image.naturalWidth, image.naturalHeight, 0.135);
      this.sideData.photoTransform = normalizePhotoTransform(this.sideData.photoTransform);
      this.draw();
    });
  }
}

function hasPhotoTransform(transform) {
  return Math.abs(transform.rotation) > 0.001
    || Math.abs(transform.tiltX) > 0.001
    || Math.abs(transform.tiltY) > 0.001;
}

function findClosestSideHandle(pointer, handles, radius) {
  let closestSide = null;
  let closestDistance = radius;

  handles.forEach((handle) => {
    const distance = Math.hypot(pointer.x - handle.point.x, pointer.y - handle.point.y);
    if (distance <= closestDistance) {
      closestDistance = distance;
      closestSide = handle.side;
    }
  });

  return closestSide;
}

function getPointBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function createTranslationMatrix(x, y) {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

function createScaleMatrix(x, y) {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

function multiplyMatrices(left, right) {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function getTriangleTransform(source, destination) {
  const sourceVectorX1 = source[1].x - source[0].x;
  const sourceVectorY1 = source[1].y - source[0].y;
  const sourceVectorX2 = source[2].x - source[0].x;
  const sourceVectorY2 = source[2].y - source[0].y;
  const destinationVectorX1 = destination[1].x - destination[0].x;
  const destinationVectorY1 = destination[1].y - destination[0].y;
  const destinationVectorX2 = destination[2].x - destination[0].x;
  const destinationVectorY2 = destination[2].y - destination[0].y;
  const determinant = sourceVectorX1 * sourceVectorY2 - sourceVectorY1 * sourceVectorX2;

  if (Math.abs(determinant) < 0.000001) {
    return null;
  }

  const a = (destinationVectorX1 * sourceVectorY2 - destinationVectorX2 * sourceVectorY1) / determinant;
  const b = (destinationVectorY1 * sourceVectorY2 - destinationVectorY2 * sourceVectorY1) / determinant;
  const c = (-destinationVectorX1 * sourceVectorX2 + destinationVectorX2 * sourceVectorX1) / determinant;
  const d = (-destinationVectorY1 * sourceVectorX2 + destinationVectorY2 * sourceVectorX1) / determinant;

  return {
    a,
    b,
    c,
    d,
    e: destination[0].x - a * source[0].x - c * source[0].y,
    f: destination[0].y - b * source[0].x - d * source[0].y,
  };
}

function invertMatrix(matrix) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

  if (Math.abs(determinant) < 0.000001) {
    return null;
  }

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

function transformPoint(matrix, point) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = dataUrl;
  });
}

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
