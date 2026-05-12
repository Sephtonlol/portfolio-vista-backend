# Zip Upload Endpoint Documentation

## Overview

The new `/api/items/upload-zip` endpoint allows bulk uploading of files and folders from a zip archive. The endpoint automatically:

- Extracts all files and directories from the zip
- Validates that all files are supported types
- Normalizes file types to standardized formats
- Saves special file types (presentations) to the server
- Creates corresponding database entries for all items

## Endpoint Details

### URL

```
POST /api/items/upload-zip
```

### Authentication

Currently **no authentication required**.

### Request

**Content-Type:** `application/octet-stream`

**Request Body:** Raw zip file binary data

**Query Parameters (Optional):**

- `parentId` - MongoDB ObjectId of the parent folder (if omitted, items are created at root level)

**Example curl:**

```bash
curl -X POST http://localhost:3000/api/items/upload-zip \
  -H "Content-Type: application/octet-stream" \
  --data-binary @archive.zip

# With parentId:
curl -X POST "http://localhost:3000/api/items/upload-zip?parentId=507f1f77bcf86cd799439011" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @archive.zip
```

### Supported File Types

The endpoint accepts the following file types and automatically normalizes them:

| Input Extension(s)                                       | Normalized Type        | Storage                                           |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| `.md`, `.txt`, `.markdown`                               | `md`                   | Content stored in database                        |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp` | `png`                  | Placeholder in database                           |
| `.mp4`, `.mov`, `.avi`, `.mkv`, `.flv`, `.webm`          | `mp4`                  | Placeholder in database                           |
| `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`, `.m4a`          | `mp3`                  | Placeholder in database                           |
| `.ppt`, `.pptx`                                          | Stored with public URL | File saved to `/public/uploads/` with public link |

**Unsupported types will cause the upload to fail** with an error listing the problematic files.

### Response

**Success (201 Created):**

```json
{
  "message": "Successfully imported 5 items from zip",
  "itemsCreated": 5,
  "items": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "README.md",
      "type": "md",
      "parentId": null,
      "content": "# My Project\nContent here...",
      "createdAt": "2026-05-12T10:30:00Z",
      "updatedAt": "2026-05-12T10:30:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "presentation.pptx",
      "type": "ppt",
      "parentId": null,
      "url": "/public/uploads/1715516400000_presentation.pptx",
      "createdAt": "2026-05-12T10:30:00Z",
      "updatedAt": "2026-05-12T10:30:00Z"
    }
  ]
}
```

**Error Cases:**

1. No zip file (422):

```json
{
  "error": "Zip file is required in request body"
}
```

2. Unsupported file types (422):

```json
{
  "error": "Unsupported file types found: file.xyz, doc.docx"
}
```

3. Invalid parentId (422):

```json
{
  "error": "parentId must be a valid ObjectId or null"
}
```

4. Parent folder not found (404):

```json
{
  "error": "Parent folder not found."
}
```

5. Server error (500):

```json
{
  "error": "Failed to upload from zip file."
}
```

## Usage Examples

### JavaScript/Node.js

```javascript
const fs = require("fs");
const axios = require("axios");

const zipFile = fs.readFileSync("./my-files.zip");

const response = await axios.post(
  "http://localhost:3000/api/items/upload-zip",
  zipFile,
  {
    headers: {
      "Content-Type": "application/octet-stream",
    },
  },
);

console.log(`Imported ${response.data.itemsCreated} items`);
```

### Python

```python
import requests

with open('my-files.zip', 'rb') as f:
    response = requests.post(
        'http://localhost:3000/api/items/upload-zip',
        data=f,
        headers={'Content-Type': 'application/octet-stream'}
    )

print(f"Imported {response.json()['itemsCreated']} items")
```

### With Parent Folder

```bash
# Create or get a folder first
FOLDER_ID="507f1f77bcf86cd799439011"

curl -X POST "http://localhost:3000/api/items/upload-zip?parentId=$FOLDER_ID" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @my-files.zip
```

## Folder Structure Handling

The endpoint preserves the folder structure from the zip file. For example:

```
my-archive.zip
├── docs/
│   ├── README.md
│   └── guide.txt
├── images/
│   └── logo.png
└── video.mp4
```

Will create:

- Root items:
  - `docs/` (directory)
  - `video.mp4` (mp4 type)
- Under `docs/`:
  - `README.md` (md type)
  - `guide.txt` (md type)
- Under `images/`:
  - `logo.png` (png type)

## Configuration

### File Size Limit

Set via environment variable `APP_BODY_LIMIT` (default: `50mb`):

```bash
export APP_BODY_LIMIT=100mb
```

### Upload Directory

Presentation files are saved to `{PROJECT_ROOT}/public/uploads/`

The public files are served at `/public/uploads/{filename}`

## File Type Processing Details

### Markdown Files

- Content is extracted and stored in the database
- Both `.md` and `.txt` files are normalized to `md` type
- Content is stored as UTF-8 (binary files show `[Binary content]` placeholder)

### Image Files

- Any image format is normalized to `png` type
- Supports: `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.png`
- Currently stored as placeholder entries; URLs can be added later

### Video Files

- Any video format is normalized to `mp4` type
- Supports: `.mp4`, `.mov`, `.avi`, `.mkv`, `.flv`, `.webm`
- Currently stored as placeholder entries; URLs can be added later

### Audio Files

- Any audio format is normalized to `mp3` type
- Supports: `.mp3`, `.wav`, `.aac`, `.flac`, `.ogg`, `.m4a`
- Currently stored as placeholder entries; URLs can be added later

### Presentation Files

- `.ppt` and `.pptx` files are saved to the server
- Stored in `/public/uploads/` with a timestamp prefix for uniqueness
- The database entry includes a public URL to access the file
- Clients can download or view presentations via the provided URL

## Future Enhancements

Potential improvements for this endpoint:

- Add authentication requirement
- Support for more file types (PDFs, Word docs, etc.)
- Metadata extraction (image dimensions, video duration, etc.)
- Progress reporting for large uploads
- Async processing for very large archives
- File content URL generation for media files
- Validation of zip file integrity before processing
