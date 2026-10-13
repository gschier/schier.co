import { createFileRoute } from '@tanstack/react-router'
import { isAdminRequest } from '#/server/admin'
import { error, json } from '#/server/http'
import { sameOrigin, textError } from '#/server/pages'
import { uploadImage } from '#/server/uploads'

// The editor's image upload (Go's PUT /api/blog/assets): a multipart form
// with the image as `file`, kept in storage as images/a/{unix}{ext}; answers
// { url: "/media/images/a/..." } for the post's markdown or social image.
// Images only, up to 25 MB, as the MCP's upload_image takes them. Without
// a signed-in session this is a 404, like every admin page.

/// The largest image taken.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export const Route = createFileRoute('/api/admin/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAdminRequest(request))) return textError(404, 'Not Found')
        if (!sameOrigin(request)) return textError(403, 'Forbidden')
        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return error(400, 'Send the image as multipart form data, in a field named file')
        }
        const file = form.get('file')
        if (!(file instanceof File)) return error(400, 'Send the image in a field named file')
        const type = file.type.trim().toLowerCase()
        if (!/^image\/[a-z0-9.+-]+$/.test(type)) return error(415, `${file.name || 'The file'} is not an image`)
        if (!file.size) return error(400, `${file.name || 'The image'} is empty`)
        if (file.size > MAX_IMAGE_BYTES) return error(413, `${file.name || 'The image'} is ${file.size} bytes; at most ${MAX_IMAGE_BYTES} are taken`)
        const url = await uploadImage(new Uint8Array(await file.arrayBuffer()), type, file.name)
        return json({ url })
      },
    },
  },
})
