# Step 1: Import library
from sklearn.tree import DecisionTreeClassifier

# Step 2: Create dataset
# [number_of_peaks, average_intensity]
X = [
    [3, 120],
    [4, 150],
    [6, 250],
    [7, 300],
    [2, 100],
    [8, 320]
]

# Labels
y = ["Low", "Low", "High", "High", "Low", "High"]

# Step 3: Train model
model = DecisionTreeClassifier()
model.fit(X, y)

# Step 4: Test prediction
test_data = [[5, 20]]
prediction = model.predict(test_data)

print("Prediction:", prediction)