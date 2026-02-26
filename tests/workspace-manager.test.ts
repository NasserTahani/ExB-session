import { jest } from '@jest/globals';
import { saveMapSession, updateMapSession, listMapSessions, loadMapSession, deleteMapSession } from '../src/runtime/workspace-manager';
import esriRequest from 'esri/request';

/**
 * Mocks Esri modules used in the workspace manager to prevent actual API calls and to allow testing of the saveMapSession function in isolation.
 */
jest.mock('esri/layers/MapImageLayer', () => jest.fn())
jest.mock('esri/layers/FeatureLayer', () => jest.fn())
jest.mock('esri/layers/TileLayer', () => jest.fn())
jest.mock('esri/Basemap', () => jest.fn())

/**
 * Mocks REST calls
 */
jest.mock('esri/request', () => {
    return {
        __esModule: true,
        default: jest.fn(() => Promise.resolve({ data: {} }))
    };
});


/**
 * Mocks jimu-core's SessionManager and getAppStore to simulate login and portal. 
 */
jest.mock('jimu-core', () => ({
    SessionManager: {
        getInstance: () => ({
            getMainSession: () => ({ token: 'fake-token' })
        })
    },
    getAppStore: () => ({
        getState: () => ({ portalUrl: 'https://fake.portal' })
    })
}))

//----------------------------------------------------------------
// FAKE DATA
//----------------------------------------------------------------

const portal = {
  user: { username: 'test-user' },
  load: jest.fn()
} as any;
portal.load.mockResolvedValue(portal);

const layer = {
  id: 'layer1',
  type: 'feature',
  title: 'Test',
  visible: true,
  opacity: 1,
  renderer: { toJSON: () => ({}) }
};

const map = {
  layers: {
    toArray: () => [layer],
    find: jest.fn(),
    forEach: jest.fn()
  },
  basemap: null
};

const view = {
  map,
  extent: { toJSON: () => ({}) },
  zoom: 4,
  goTo: jest.fn()
};

const jimuMapView = { view };

beforeEach(() => {
  jest.clearAllMocks();
  portal.load.mockResolvedValue(portal);
});

// ----------------------------------------------------------------
// LIST MAP SESSION TESTS
// ----------------------------------------------------------------

/**
 * This test verifies that when listMapSessions is called, it makes a request to the portal and returns an array of sessions with the expected properties.
 */
test('lists sessions and maps results', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({
    data: {
      results: [
        { id: 'item1', title: 'Workspace 1' },
        { id: 'item2', title: 'Workspace 2' }
      ]
    }
  });

  const sessions = await listMapSessions(portal);
  expect(esriRequest).toHaveBeenCalled();
  expect(sessions).toEqual([
    { id: 'item1', label: 'Workspace 1' },
    { id: 'item2', label: 'Workspace 2' }
  ]);
});

/**
 * This test verifies that when listMapSessions is called and the portal returns no results, it returns an empty array.
 */
test('lists sessions returns empty array if no results', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({ data: { results: [] } });
  const sessions = await listMapSessions(portal);
  expect(Array.isArray(sessions)).toBe(true);
  expect(sessions.length).toBe(0);
});

// ----------------------------------------------------------------
// SAVE MAP SESSION TESTS
// ----------------------------------------------------------------

/**
 * This test verifies that when saveMapSession is called, it makes a request to create a portal item and returns the expected item ID.
 */
test('save a session by creating a portal item', async () => {

    (esriRequest as jest.Mock<any>).mockResolvedValue({
        data: { success: true, id: 'abc123' }
    })

    const result = await saveMapSession(
        portal,
        { id: '', label: 'Workspace A' },
        jimuMapView as any
    )

    expect(esriRequest).toHaveBeenCalled()
    expect(result.id).toBe('abc123')
})

test('saveMapSession throws when map view is missing', async () => {
  await expect(
    saveMapSession(portal, { id: '', label: 'Workspace A' }, {} as any)
  ).rejects.toThrow('Map view is required to save session');
});


/**
 * Tests that saveMapSession throws an error when the portal save operation fails 
 */
test('throws when portal save fails', async () => {

  (esriRequest as jest.Mock<any>).mockResolvedValue({
    data: { success: false }
  })

  await expect(
    saveMapSession(portal, { id:'', label:'A' }, jimuMapView as any)
  ).rejects.toThrow()
})

// ----------------------------------------------------------------
// LOAD MAP SESSION TESTS
// ----------------------------------------------------------------

/**
 * Tests that loadMapSession successfully loads a session and returns the expected session state
 */
test('loads session and restores map', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({
    data: {
      valid: true,
      mapSession: {
        basemapId: undefined,
        basemapSnapshot: undefined,
        extent: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
        zoom: 4,
        layers: []
      }
    }
  });

  await expect(
    loadMapSession(portal, 'itemId', jimuMapView as any)
  ).resolves.toHaveProperty('valid', true);
});

test('loadMapSession uses zoom fallback when extent is missing', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({
    data: {
      valid: true,
      mapSession: {
        basemapId: undefined,
        basemapSnapshot: undefined,
        extent: undefined,
        zoom: 9,
        layers: []
      }
    }
  });

  await loadMapSession(portal, 'itemId', jimuMapView as any);
  expect(view.goTo).toHaveBeenCalledWith({ zoom: 9 }, { animate: false });
});

test('loadMapSession removes map layers not present in the saved session', async () => {
  const keepLayer = { id: 'keep', url: 'https://service/keep' } as any;
  const removeLayer = { id: 'remove', url: 'https://service/remove' } as any;
  const remove = jest.fn();
  const reorder = jest.fn();
  const localMap = {
    ...map,
    layers: {
      toArray: () => [keepLayer, removeLayer],
      find: (predicate: any) => [keepLayer, removeLayer].find(predicate),
      forEach: (cb: any) => [keepLayer, removeLayer].forEach(cb)
    },
    remove,
    reorder
  };
  const localView = { ...view, map: localMap };

  (esriRequest as jest.Mock<any>).mockResolvedValue({
    data: {
      valid: true,
      mapSession: {
        basemapId: undefined,
        basemapSnapshot: undefined,
        extent: undefined,
        zoom: 4,
        layers: [
          {
            id: 'keep',
            url: 'https://service/keep',
            type: 'feature',
            visible: true,
            opacity: 1,
            renderer: {},
            order: 0
          }
        ]
      }
    }
  });

  await loadMapSession(portal, 'itemId', { view: localView } as any);
  expect(remove).toHaveBeenCalledWith(removeLayer);
  expect(remove).not.toHaveBeenCalledWith(keepLayer);
  expect(reorder).toHaveBeenCalledWith(keepLayer, 0);
});

/**
 * Tests that loadMapSession throws an error when the loaded session is invalid
 */
test('throws if loaded session is invalid', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({ data: { valid: false } });
  await expect(
    loadMapSession(portal, 'itemId', jimuMapView as any)
  ).rejects.toThrow('Item is not a valid workspace session');
});

// ----------------------------------------------------------------
// DELETE MAP SESSION TESTS
// ----------------------------------------------------------------

/**
 * Tests that deleteMapSession successfully deletes a session when the portal responds with success
 */
test('delete session succeeds', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({ data: { success: true } });
  await expect(deleteMapSession(portal, 'itemId')).resolves.toBeUndefined();
});

/**
 * Tests that deleteMapSession throws an error when the portal responds with failure
 */
test('delete session throws on failure', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({ data: { success: false, error: { message: 'fail' } } });
  await expect(deleteMapSession(portal, 'itemId')).rejects.toThrow('fail');
});

// ----------------------------------------------------------------
// UPDATE MAP SESSION TESTS
// ----------------------------------------------------------------

/**
 * Tests that updateMapSession successfully updates a session and returns the expected item ID
 */
it('throws when updateMapSession called without id', async () => {
  await expect(
    updateMapSession(portal, { id: '', label: 'Workspace A' }, jimuMapView as any)
  ).rejects.toThrow('Cannot update a session without an ID');
});

/**
 * Tests that updateMapSession successfully updates a session and returns the expected item ID
 */
it('updates a session by updating a portal item', async () => {

  (esriRequest as jest.Mock<any>).mockResolvedValue({
    data: { success: true, id: 'abc123' }
  });

    const result = await updateMapSession(
        portal,
        { id: 'abc123', label: 'Workspace A' },
        jimuMapView as any
    );
    expect(esriRequest).toHaveBeenCalled()
    expect(result.id).toBe('abc123')
});

it('updateMapSession throws when map view is missing', async () => {
  await expect(
    updateMapSession(portal, { id: 'abc123', label: 'Workspace A' }, {} as any)
  ).rejects.toThrow('Map view is required to save session');
});

/**
 * Tests that updateMapSession throws an error when the portal update operation fails
 */
it('throws when updateMapSession fails', async () => {
  (esriRequest as jest.Mock<any>).mockResolvedValue({ data: { success: false, error: { message: 'update failed' } } });
  await expect(
    updateMapSession(portal, { id: 'abc', label: 'Workspace A' }, jimuMapView as any)
  ).rejects.toThrow('update failed');
});
