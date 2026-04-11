import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

# Load dataset
df = pd.read_csv("dataset1.csv")

# Features
X = df[['peaks', 'max', 'avg']]

# Label
y = df['label']

# Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Model
model = LogisticRegression()

# Train
model.fit(X_train, y_train)

print("Model trained ✅")

# Test prediction
pred = model.predict(X_test)
print("Test Output:", pred)

# Predict new data
new_data = [[2,15000,9000]]
print("New Prediction:", model.predict(new_data))