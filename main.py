import os
import pandas as pd
import numpy as np

X = []
y = []

dataset_path = "dataset"   # change to "bolt" if your data is inside bolt folder

for compound in os.listdir(dataset_path):
    compound_path = os.path.join(dataset_path, compound)
    
    for file in os.listdir(compound_path):
        file_path = os.path.join(compound_path, file)
        
        try:
            df = pd.read_csv(file_path, sep="\t", skiprows=8, header=None)
            
            intensity = df.iloc[:, 1].values
            
            # normalize
            intensity = (intensity - np.min(intensity)) / (np.max(intensity) - np.min(intensity))
            
            X.append(intensity)
            y.append(compound)
        
        except:
            continue

min_len = min(len(i) for i in X)
X = [i[:min_len] for i in X]

X = np.array(X)
y = np.array(y)

from sklearn.neighbors import KNeighborsClassifier

model = KNeighborsClassifier(n_neighbors=3)
model.fit(X, y)

print("Training completed!")