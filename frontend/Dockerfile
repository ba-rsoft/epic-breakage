# Use Node base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Expose frontend port (React default is 3000)
EXPOSE 3000

# Start the React app
CMD ["npm", "start"]
