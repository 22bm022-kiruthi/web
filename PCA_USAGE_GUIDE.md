# ✅ PCA Service - How to Use and View Output

## 🎯 Problem Fixed
**Error:** "PCA service unreachable. Make sure the PCA service is running on port 6005."

**Solution:** The PCA Python service is now running on port 6005!

---

## 🚀 Services Running

### ✅ Backend Server (Port 5003)
- **Status:** Running
- **URL:** http://127.0.0.1:5003
- **Purpose:** Main API gateway, proxies requests to Python services

### ✅ PCA Service (Port 6005)
- **Status:** Running
- **URL:** http://127.0.0.1:6005
- **Purpose:** Principal Component Analysis computations using scikit-learn

---

## 📊 How to Use PCA in Your App

### Step 1: Load Your Data
1. Open your app at http://localhost:5174
2. Click the **Supabase Widget** or **Upload Widget** to load spectral data
3. Make sure your data has numeric columns (wavelengths, intensities, etc.)

### Step 2: Add PCA Widget
1. From the **Sidebar**, drag the **PCA Analysis** widget onto the canvas
2. Connect your data source widget to the PCA widget (drag from output to input dot)

### Step 3: Configure PCA Parameters
1. Click the **⚙️ Parameters** button on the PCA widget
2. Set your parameters:
   - **Number of Components (n_components):** How many principal components to compute (default: 2)
   - **Standardize:** Whether to standardize data before PCA (recommended: ✅ checked)

### Step 4: Run PCA Computation
1. Click the **Compute** button in the parameters modal
2. Wait for computation to complete (should be instant for small datasets)
3. The PCA widget will update with results

### Step 5: View PCA Output

#### Option A: View as Table
1. Click the **📊 View Data** button on the PCA widget
2. You'll see a table with columns:
   - `PC1`: First principal component scores
   - `PC2`: Second principal component scores
   - `PC3+`: Additional components if n_components > 2

#### Option B: View as Chart
1. Connect the PCA widget output to a **Chart Widget**
2. Configure chart to plot:
   - **X-axis:** PC1
   - **Y-axis:** PC2
   - **Type:** Scatter plot (recommended for PCA score plots)

#### Option C: Check Console Output
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Look for PCA results logged with structure:
   ```javascript
   {
     transformed: [...],              // PC scores for each sample
     explained_variance_ratio: [...], // % variance explained by each PC
     cumulative_variance: [...],      // Cumulative variance explained
     components_matrix: [...],        // Loadings matrix
     used_columns: [...]              // Which columns were used
   }
   ```

---

## 🔍 Understanding PCA Output

### Transformed Data (PC Scores)
- Each row is a sample from your original data
- Each column (PC1, PC2, etc.) represents a principal component
- PC1 captures the most variance, PC2 the second most, etc.

### Explained Variance Ratio
- Shows what percentage of total variance each PC captures
- Example: `[0.85, 0.10, 0.03]` means:
  - PC1 explains 85% of variance
  - PC2 explains 10% of variance
  - PC3 explains 3% of variance

### Cumulative Variance
- Running total of variance explained
- Example: `[0.85, 0.95, 0.98]` means:
  - First 2 PCs explain 95% of variance
  - First 3 PCs explain 98% of variance

### Use Case Example
If you have Raman spectra with 1000 wavelength points:
- Original data: 1000 features per spectrum
- After PCA with n_components=2: Only 2 features (PC1, PC2)
- You've reduced dimensionality from 1000 → 2 while keeping most information!

---

## ⚙️ PCA Parameters Explained

### Number of Components (n_components)
- **What it is:** How many principal components to compute
- **Default:** 2 (good for 2D scatter plots)
- **Min:** 1
- **Max:** Limited by min(n_samples, n_features)
- **Recommendation:**
  - Use 2-3 for visualization
  - Use more for dimensionality reduction before other analyses

### Standardize (Scale)
- **What it is:** Whether to normalize each feature to mean=0, std=1
- **Default:** ✅ Checked (True)
- **Why important:** 
  - Features with larger magnitudes dominate PCA if not standardized
  - For Raman spectra, standardization ensures all wavelengths contribute equally
- **Recommendation:** Keep checked unless you have a specific reason not to

---

## 🛠️ Troubleshooting

### PCA button does nothing
- **Check:** Is data connected to PCA widget input?
- **Check:** Does your data have numeric columns?
- **Solution:** Open browser console (F12) to see error messages

### "No numeric columns found for PCA"
- **Problem:** Your data doesn't have numeric columns, or they're formatted as text
- **Solution:** Make sure your CSV/data has numeric intensity values

### Results look wrong
- **Check:** Did you standardize? Try toggling the standardize checkbox
- **Check:** Number of components - try n_components=2 first
- **Check:** Your data quality - PCA is sensitive to outliers

### Service stops working
- **Problem:** Python service crashed or was closed
- **Solution:** Restart it:
  ```powershell
  cd backend/python
  python pca_service_new.py
  ```

---

## 📋 Complete Workflow Example

1. **Start Services** (Already Running ✅)
   - Backend: `cd backend; $env:PORT=5003; node server.js`
   - PCA Service: `cd backend/python; python pca_service_new.py`
   - Frontend: `npm run dev`

2. **Load Data**
   - Drag Supabase widget → Click "Fetch Data" → Select table `raman_data`

3. **Add PCA Widget**
   - Drag PCA Analysis widget onto canvas
   - Connect Supabase output (right dot) to PCA input (left dot)

4. **Configure & Compute**
   - Click PCA widget → Click ⚙️ Parameters
   - Set n_components = 2, standardize = ✅
   - Click "Compute"

5. **Visualize Results**
   - Click "📊 View Data" to see PC scores table
   - OR drag Chart widget → connect PCA output to Chart input
   - Configure chart: X=PC1, Y=PC2, Type=Scatter

6. **Interpret**
   - Look at explained variance ratios in console
   - Points clustered together in PCA plot are similar samples
   - Points far apart are different samples

---

## 🎓 What PCA Does (Simple Explanation)

Imagine you have 100 photos taken from slightly different angles of the same object.

- **Before PCA:** You need all 100 photos to describe the object
- **After PCA:** You discover that ~95% of information is captured in just 2-3 "average views"
- **Result:** You can represent the object with 2-3 numbers instead of 100 photos!

For Raman spectra:
- **Before:** 1000 intensity values (one per wavelength)
- **After PCA:** 2-3 principal component scores
- **Benefit:** Easier to visualize, cluster, and classify spectra

---

## ✨ Next Steps

1. **Test it now:** Go to http://localhost:5174 and try PCA!
2. **Check console:** Open F12 DevTools to see detailed PCA output
3. **Experiment:** Try different n_components values (2, 3, 5, 10)
4. **Compare:** Run PCA with and without standardization to see the difference

---

**Remember:** Both services must stay running (keep terminal windows open)!

- Backend terminal: Shows API request logs
- PCA service terminal: Shows PCA computation logs

If you close either terminal, the app will show errors. Just restart the service using the commands above.
