import { render, screen } from '@testing-library/react';
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import ScenarioPage from "./pages/ScenarioPage";

test('renders ScenarioPage for /scenarios/:ticketId route', () => {
  render(
    <Router>
      <Routes>
        <Route path="/scenarios/:ticketId" element={<ScenarioPage />} />
      </Routes>
    </Router>
  );

  // Simulate a route with a ticket ID
  window.history.pushState({}, 'Test Page', '/scenarios/RSOFT-12345');

  // Check if the ScenarioPage component is rendered
  const headingElement = screen.getByText(/Scenarios for Ticket:/i);
  expect(headingElement).toBeInTheDocument();
});