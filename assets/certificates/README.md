# Supabase public database CA

Public CA certificate; not a private key or application credential.

Source verified on 2026-10-24 against Supabase's official Studio configuration:
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json

Configuration key ssl:certificate_url resolves the production download to:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Subject: Supabase Root 2021 CA, Supabase Inc.
Expires: 2031-04-26 10:56:53 GMT.
SHA-256 fingerprint: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA

Only database connections load this certificate. Certificate-chain and hostname verification remain enabled. Future certificate rotation must use an authenticated official source and be explicitly reviewed; never trust a root taken from a failed remote handshake.
