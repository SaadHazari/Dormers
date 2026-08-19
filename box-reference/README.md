# Box reference photos

Catalogue photos of the Dormers meal box, sent to the vision model alongside
the rider's photo so it knows what a box looks like.

## Adding or replacing them

1. Drop full-size photos (phone photos are fine) into `box-reference/source/`.
   One per face is ideal: lid, long side, short side with the QR, and an
   angled shot showing the orange-and-white striped edge.
2. Run `npm run prep:box-reference`.
3. Commit the downscaled `.jpg` files this writes into `box-reference/`.

Name them so they sort in a sensible order and describe the face, e.g.
`1-lid.jpg`, `2-long-side.jpg`, `3-qr-side.jpg`. The filename becomes the
label the model sees, so `3-qr-side.jpg` is read as "qr side".

## Why they are downscaled

Every reference image is re-sent on **every** box count, at pickup and at each
dorm. A 3 MB phone photo would be uploaded dozens of times a day and would eat
the function's time budget. The loader skips anything over 300 KB and says so
in the logs.

## What they do and do not do

They help the model recognise a Dormers box. They do **not** make it count
reliably. On 2026-08-19 it read five boxes as six at "high" confidence. The
real fix for that was removing the expected count from the prompt (it was
being told the answer) and letting it return null when unsure. Reference
photos are the smallest of the three fixes. Do not start trusting the count
because these exist.
