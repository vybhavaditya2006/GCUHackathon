# Edge-device quantisation notes (original work)

Goal for Milestone 2: get the screening model under 10 MB and under 2 seconds per image on the Kestrel-2 board.

What I tried this week:

1. Post-training dynamic range quantisation in TensorFlow Lite. Size dropped from 94 MB to 24 MB. Still too big.
2. Full integer quantisation with a 200-image calibration set drawn from our own training split. Size 23.6 MB,
   latency 3.1 s. Sensitivity fell by 1.2 points, mostly on grade 2 images with poor focus.
3. Swapped the backbone for MobileNetV3-Small and repeated step 2. Size 6.8 MB, latency 1.4 s on the board.
   Sensitivity is 2.9 points below the baseline, so we need a short fine-tuning run before this is acceptable.

Next: quantisation-aware fine-tuning for five epochs, then re-measure on the held-out set with Dr. Shetty.
