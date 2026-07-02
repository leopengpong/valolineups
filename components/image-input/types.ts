// Stable sort ID for a DnD item: storage path for existing images, UUID for new ones.
// Assigned at creation time and never changes, so reordering survives URL rotation.
export type ImageItem = {
  id: string;
  file?: File;
  previewUrl: string;
  existingPath?: string;
  label?: string;
  zoomEnabled?: boolean;
  zoomX?: number;
  zoomY?: number;
  customCrop?: boolean;
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
};
