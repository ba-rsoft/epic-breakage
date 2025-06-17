# Use Node.js base image
FROM node:18

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy all backend source code
COPY . .

# Expose the port your backend uses (adjust if different)
EXPOSE 5000

# Start the backend server (change this if your start command is different)
CMD ["node", "server.js"]
