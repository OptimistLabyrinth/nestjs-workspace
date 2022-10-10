# Coffee Shop Order Service

## Menu Item

| Title | Description |
|---|---|
| MenuItem | Each menu item on the menu board. |
| name |  |
| price | Default price of each menu item. Price may change depending on the customer's option. |
| menu type | Type or category of the menu. Type can be one of these: coffee, beverage, bottle, side menu |
| possible cup size | cup size candidates that a customer can choose when he/she request an order |

- menu type
  - one of these
    - coffee
    - beverage(other than coffee)
    - bottle(which is displayed on the showcase)
    - side menu(sandwich, salad, bread, cookie)

### 1. Register Menu (POST /menus)

- name
  - always exist
  - length of name must be at least 1
- price
  - always exist
  - at least 0 won
- menu type
  - always exist

### 2. Show List of Menus (GET /menus)

- more to come

### 3. Detail of a Menu (GET /menus/:id)

- id
  - always exist
  - must be string

### 3. Edit Menu (PATCH /menus/:id)

- id
  - always exist
  - must be string
- name
  - optional
  - if it exists, length of name must be at least 1
- price
  - optional
  - if it exists, at least 0 won
- menu type
  - optional
  - if it exists, must be one of the types described above

### 4. Delete the Menu (DELETE /menus/:id)

- id
  - always exist
  - must be string

## Customer

| Title | Description |
|---|---|
| Customer | Each customer who registered to the order service. |
| name |  |
| nickname |  |
| sign in id | id needed to sign in |
| sign in password  | password needed to sign in |

### 1. Register Customer (POST /customers)

- name
  - optional
- nickname
  - optional
- sign in id
  - always exist
  - length at least 8
- sign in password
  - always exist
  - length at least 12
  - combination of alphabet, digits, special characters

### 2. Show List of Customers (GET /customers)

- more to come

### 3. Detail of a Customer (GET /customers/:id)

- id
  - always exist
  - must be string

### 4. Edit Customer (PATCH /customers/:id)

- id
  - always exist
  - must be string

- name
  - optional
- nickname
  - optional

### 5. Change Password (PATCH /customers/:id/password)

- id
  - always exist
  - must be string
- sign in password
  - always exist
  - length at least 12
  - combination of alphabet, digits, special characters

### 6. Delete the Customer (DELETE /customers/:id)

- id
  - always exist
  - must be string

## Order

| Title | Description |
|---|---|
| Order | A Customer request an Order purchasing at least one Menu Item. |
| Customer | customer who requested current order. |
| Products In Order | products which is/are included in current order |
| discount percentage |  |

## Product In Order

| Title | Description |
|---|---|
| Product In Order | Each product which is/are included in the Order |
| product id |  |
| cup size |  |
| whipping cream |  |
| espresso shot | number of espresso shot demanded |

- cup size
  - one of the 'possible cup sizes' in the Menu Item

### 1. Request New Order (POST /orders)

- customer
  - customer with the id should be found. If not found, exception thrown.
- products in order
  - each product with the id should be found. If not found, exception thrown.

## Change Order State

- state
  - one of these
    - requested
    - accepted
    - delivering
    - completed
    - rejected

### 1. Order Accept (PATCH /orders/:id/accept)

- id
  - always exist
  - must be string
- previously the state of the order must be in requested state.

### 2. Order start Delivering (PATCH /orders/:id/delivering)

- id
  - always exist
  - must be string
- previously the state of the order must be in accepted state.

### 3. Order Completed (PATCH /orders/:id/completed)

- id
  - always exist
  - must be string
- previously the state of the order must be in delivering state.

### 4. Order Rejected (PATCH /orders/:id/rejected)

- id
  - always exist
  - must be string
- previously the state of the order must be in rejected state.


