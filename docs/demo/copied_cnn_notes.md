# Baseline CNN notes

Baseline CNN for diabetic retinopathy grading. We fine-tune a ResNet-50 pretrained on ImageNet using
fundus images resized to 512 by 512 pixels. Preprocessing applies contrast limited adaptive histogram
equalisation to the green channel, then normalises each image to zero mean and unit variance. Training
uses the Adam optimiser with a learning rate of 0.0001, a batch size of 32 and early stopping on the
validation quadratic weighted kappa. Class imbalance is handled with a weighted cross entropy loss, and
augmentation includes random rotation, horizontal flips and small brightness shifts. The model reaches
a sensitivity of 0.88 at grade two or above on the public test split.
