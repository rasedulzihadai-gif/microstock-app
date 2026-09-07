"use client";
import { IconUpload } from "./icons";

export function Dropzone({ isOver, hasItems, onBrowse }) {
  return (
    <div className={`dropzone${isOver ? " dropzone--over" : ""}`}>
      <div className="dropzone__icon">
        <IconUpload width={20} height={20} />
      </div>
      <div className="dropzone__title">{hasItems ? "Select an image to inspect" : "Drop images to get started"}</div>
      <p className="dropzone__hint" style={{ margin: 0 }}>
        {hasItems
          ? "Pick an item from the queue on the left, or drop more files here."
          : "Drag JPG or PNG files anywhere on this canvas. We resize them locally before analysis."}
      </p>
      <button className="btn btn--ghost" onClick={onBrowse} style={{ marginTop: 8 }}>
        Browse files
      </button>
    </div>
  );
}
