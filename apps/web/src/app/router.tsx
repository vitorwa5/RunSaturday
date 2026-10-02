import { createBrowserRouter } from 'react-router';
import { ComparePage } from '../pages/ComparePage';
import { CurrentFormPage } from '../pages/CurrentFormPage';
import { EventPage } from '../pages/EventPage';
import { ExplorePage } from '../pages/ExplorePage';
import { HiddenGemsPage } from '../pages/HiddenGemsPage';
import { HomePage } from '../pages/HomePage';
import { MapPage } from '../pages/MapPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PbFinderPage } from '../pages/PbFinderPage';
import { PerformanceFormPage } from '../pages/PerformanceFormPage';
import { PerformancesPage } from '../pages/PerformancesPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SaturdayPage } from '../pages/SaturdayPage';
import { WhereCouldIPlacePage } from '../pages/WhereCouldIPlacePage';
import { AppLayout } from './AppLayout';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/saturday', element: <SaturdayPage /> },
      { path: '/map', element: <MapPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/profile/current-form', element: <CurrentFormPage /> },
      { path: '/profile/performances', element: <PerformancesPage /> },
      { path: '/profile/performances/new', element: <PerformanceFormPage /> },
      { path: '/profile/performances/:id/edit', element: <PerformanceFormPage /> },
      { path: '/event/:id', element: <EventPage /> },
      { path: '/pb-finder', element: <PbFinderPage /> },
      { path: '/where-could-i-place', element: <WhereCouldIPlacePage /> },
      { path: '/hidden-gems', element: <HiddenGemsPage /> },
      { path: '/compare', element: <ComparePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
