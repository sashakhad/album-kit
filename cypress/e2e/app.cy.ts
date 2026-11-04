describe('App', () => {
  it('should load the application', () => {
    cy.visit('/');

    cy.get('body').should('be.visible');
    cy.get('html').should('have.attr', 'lang');
    cy.get('main').should('be.visible');
    cy.get('h1').should('be.visible');
    cy.get('form').should('be.visible');
    cy.get('button[type="submit"]').should('contain', 'Submit');
  });

  it('should render the example form fields', () => {
    cy.visit('/');

    cy.get('input[name="email"]').should('exist');
    cy.get('input[name="password"]').should('exist');
    cy.get('input[name="confirmPassword"]').should('exist');
  });
});
