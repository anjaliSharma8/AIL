/*
# Create audio-uploads storage bucket

1. New Storage Bucket
- `audio-uploads` — private bucket for user-uploaded audio files
- Used to temporarily store audio files for AI transcription via Gemini

2. Security
- RLS policies on storage.objects for the audio-uploads bucket
- Allow anon + authenticated to upload, read, and delete (no-auth app)
- The edge function deletes files after processing to minimize retention
*/

INSERT INTO storage.buckets (id, name, public) VALUES ('audio-uploads', 'audio-uploads', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_upload_audio" ON storage.objects;
CREATE POLICY "anon_upload_audio" ON storage.objects FOR INSERT
TO anon, authenticated WITH CHECK (bucket_id = 'audio-uploads');

DROP POLICY IF EXISTS "anon_read_audio" ON storage.objects;
CREATE POLICY "anon_read_audio" ON storage.objects FOR SELECT
TO anon, authenticated USING (bucket_id = 'audio-uploads');

DROP POLICY IF EXISTS "anon_delete_audio" ON storage.objects;
CREATE POLICY "anon_delete_audio" ON storage.objects FOR DELETE
TO anon, authenticated USING (bucket_id = 'audio-uploads');
