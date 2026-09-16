import { useCallback } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { ImagePlus, Loader2 } from 'lucide-react'

interface Props {
  disabled?: boolean
  busy?: boolean
  onFiles: (files: File[]) => void
  onRejected?: (message: string) => void
}

const ACCEPT = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] }

export function Dropzone({ disabled, busy, onFiles, onRejected }: Props) {
  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length) {
        onRejected?.(
          `${rejected.length} file${rejected.length === 1 ? ' was' : 's were'} skipped (only PNG, JPEG and WebP are accepted)`,
        )
      }
      if (accepted.length) onFiles(accepted)
    },
    [onFiles, onRejected],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      className={[
        'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
        disabled ? 'cursor-not-allowed opacity-60' : '',
        isDragReject
          ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
          : isDragActive
            ? 'border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800'
            : 'border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/60',
      ].join(' ')}
    >
      <input {...getInputProps()} />
      {busy ? (
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      ) : (
        <ImagePlus className="h-8 w-8 text-neutral-400" />
      )}
      <p className="text-sm font-medium">
        {isDragActive ? 'Drop to upload' : busy ? 'Uploading… you can keep dropping files' : 'Drag & drop images, or click to choose'}
      </p>
      <p className="text-xs text-neutral-500">PNG, JPEG or WebP · any number of files · processed automatically</p>
    </div>
  )
}
